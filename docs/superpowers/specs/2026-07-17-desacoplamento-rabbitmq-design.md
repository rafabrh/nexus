# Desacoplamento via RabbitMQ + Engine N8N multi-tenant — escala 500 clientes

**Data:** 2026-07-17 (v2 em 2026-07-18 — N8N deixou de ser intocável; alvo de escala explícito)
**Status:** Aprovado — pronto para plano de implementação
**Autor:** RaFa (rafabrh)

---

## 1. Contexto e problema

Em 12/07/2026 o deploy de uma feature de UI (quick-reply com mídia) colocou a API do painel em crash-loop (`@fastify/multipart` v9 × Fastify 4). Consequência real: **o atendimento IA de todos os clientes ficou morto por 5 dias** — e ninguém foi avisado.

O motivo é estrutural. A Evolution API entrega webhooks **ao painel**, e é o painel que reencaminha cada evento ao N8N (`n8n-forwarder.service.ts`):

```
Evolution ──webhook──► PAINEL (hub) ──forwarder──► N8N (fluxo de atendimento)
                          └── Redis/Postgres (histórico, gate de IA, realtime)
```

O painel é o componente que **mais recebe deploy** e está no caminho crítico do serviço que paga as contas. O webhook "tenta e desiste": eventos do período de indisponibilidade **se perdem**.

Há um segundo problema estrutural, de **escala de operação**: o modelo atual é **um workflow N8N clonado por cliente**, com valores hardcoded (número do admin, credenciais, planilhas, persona do agente, templates). Em 500 clientes isso significa 500 artefatos vivos: um bug fix = republicar 500 fluxos; onboarding = trabalho manual por cliente; drift inevitável.

### Requisitos (do incidente + da meta de negócio)

1. **Resiliência:** o atendimento (Evolution → N8N) não pode depender do painel estar de pé; indisponibilidade de um consumidor não pode perder eventos.
2. **Escala:** a arquitetura deve operar **500 clientes** sem crescimento linear de esforço operacional (onboarding = configuração, não artefato novo; correção = 1 deploy).

---

## 2. Decisões travadas

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Mecanismo de desacoplamento | **RabbitMQ** (integração nativa da Evolution v2.3.7) |
| D2 | Onde roda o broker | **EasyPanel, projeto `siteshkgroup`** (mesma rede interna de painel/N8N/Redis) |
| D3 | Estratégia de migração | **Dual-run com dedup, piloto na instância `Shkgroup`** (a nossa), depois replica |
| D4 | Consumer do painel | Módulo NestJS novo reusando `WebhookService.processEvolutionEvent()` — zero lógica duplicada |
| D5 | Modelo do fluxo N8N | **Engine único multi-tenant**: UM workflow parametrizado serve todos os tenants; config por tenant vem de fora. O piloto já migra **direto pro engine** (sem estágio intermediário de adapter) |
| D6 | Gate de IA (`humanControlUntil`) | No engine (Redis direto, chaves canônica+cru via `rawJid`), **mantendo a exceção do self-chat** — comparação com `sender` do payload, por tenant, **sem hardcode** |
| D7 | Roteamento por tenant | Flag `transport` (`webhook` \| `amqp`) no tenant registry dirige o forwarder durante a transição; bindings **explícitos por tenant migrado** na fila do engine |
| D8 | Showcase | **PR único** (spec + implementação) contra `worktree-macos-reskin`, branch `feat/desacoplamento-rabbitmq` |
| D9 | Config store por tenant | **Postgres = fonte de verdade; write-through para o Redis; o engine lê SÓ Redis** — painel morto não interrompe atendimento |
| D10 | Fila do engine | **Fila única multi-tenant** (`nexus.n8n.events`) — casa com o engine e com workers horizontais; sharding por hash documentado como evolução, não implementado |

---

## 3. Arquitetura alvo

```
Evolution v2.3.7 ──publica──► RabbitMQ (exchange topic "evolution_exchange")
(N containers no futuro)          │
                    ┌─────────────┴──────────────────┐
             nexus.panel.events              nexus.n8n.events  (única, multi-tenant,
                    │                                │          bindings por tenant migrado)
             PAINEL (consumer NestJS)         N8N ENGINE (1 workflow parametrizado)
             histórico/realtime/UI                   │
                    │                          config do tenant ◄── Redis (tenant:cfg:*)
             Postgres (fonte de verdade  ──write-through──► Redis      ▲
             da config por tenant)                                     │
                                              gate de IA, buffer, estado (já em Redis)
```

### Matriz de falhas — hoje vs. alvo

| Se morrer... | Hoje | Alvo |
|---|---|---|
| **Painel (API)** | 🔴 Tudo morre; eventos perdidos | 🟢 Atendimento segue (engine lê config/gate do Redis); eventos do painel **acumulam na fila** e são processados na volta. Só *edição* de config fica indisponível |
| **N8N** | 🔴 Atendimento morre | 🟡 Atendimento pausa; mensagens **esperam na fila** (nada se perde) |
| **RabbitMQ** | — | 🟡 Runbook de fallback: reabilitar webhook da Evolution (mecanismo mantido); broker é infra estável, **sem deploy de feature** |
| **Redis** | 🔴 Fluxo N8N quebra (buffer/estado) | 🔴 Inalterado — Redis já é dependência dura do atendimento; fora de escopo |
| **Evolution** | 🔴 Morre tudo | 🔴 Inevitável (é a conexão WhatsApp) — sharding mapeado em §13 |

Propriedades novas: **buffer durável** (consumidor fora do ar = evento adiado, não perdido) e **operação O(1) por cliente** (onboarding/correção não escala com o número de tenants).

---

## 4. Componentes

### 4.1 Broker (RabbitMQ no EasyPanel)

- Serviço novo no projeto `siteshkgroup` (imagem `rabbitmq:3-management`), volume persistente, rede interna, management UI protegida.
- **Exchange:** `evolution_exchange` (topic) — nome default da integração da Evolution; declarado pelo producer.
- **Filas** (duráveis, mensagens persistentes). Quem declara: a `nexus.panel.events` é declarada pelo consumer NestJS no boot; a `nexus.n8n.events` é **pré-declarada manualmente** na management UI (Fase 0, §7.1) — e seus argumentos (durable, DLX `nexus.dlx`) **devem casar** com o que o RabbitMQ Trigger do N8N assere ao ativar, senão a ativação falha com `PRECONDITION_FAILED` (falha segura — mensagens seguem acumulando — mas evitável):
  - `nexus.panel.events` — bindings dos eventos que o painel processa hoje (`<inst>.messages.upsert`, `<inst>.send.message`, `<inst>.messages.update`, `<inst>.connection.update`, `<inst>.contacts.*`, `<inst>.presence.update`), com `<inst>` = `#` (todos os tenants).
  - `nexus.n8n.events` — **bindings explícitos por tenant migrado** (`shkgroup.messages.upsert` no piloto). Adicionar um tenant ao engine = adicionar binding + config (§4.6) + flip (§7.1). Tenants com fluxo custom ainda não absorvido (ex.: Geotech) simplesmente não têm binding — continuam no forwarder (`transport='webhook'`).
  - DLX `nexus.dlx` + filas `*.dlq` — mensagem que estourar tentativas cai na DLQ (replay manual no runbook; sem retry automático — YAGNI).
- **Ordem:** fila única multi-tenant não garante FIFO por conversa sob consumo concorrente. O engine já tolera: o **buffer de conversa em Redis** agrega mensagens por contato antes de responder (design atual preservado).

### 4.2 Producer — Evolution API v2.3.7

- Envs no container da Evolution: `RABBITMQ_ENABLED=true`, `RABBITMQ_URI=amqp://...`, `RABBITMQ_EXCHANGE_NAME=evolution_exchange`, `RABBITMQ_GLOBAL_ENABLED=false` (eventos por instância).
- Por instância: `POST /rabbitmq/set/{instance}` com a lista de eventos (mesma do webhook atual + os do painel).
- Payload publicado = **mesmo shape do webhook** (`event`, `instance`, `data`, `sender`, `server_url`, ...). Routing key esperada: `<instancia>.<evento>` em minúsculas. **Ambos validados na Fase 0 com fila de inspeção** — divergência de *payload* se corrige no nó de entrada do engine; divergência de *routing key*, nos **bindings** (4.1). Ambas documentadas aqui.
- ⚠️ **Regra operacional:** toda mudança na Evolution (env, `/rabbitmq/set`, webhook) é **passo manual executado com aprovação explícita do Rafa** — nunca automatizada por agente (runbook §7).

### 4.3 Consumer do painel (`apps/api/src/queue/`)

- Lib `@golevelup/nestjs-rabbitmq` (reconexão, retry e decorators prontos).
- `EvolutionQueueConsumer` (`@RabbitSubscribe` na `nexus.panel.events`): valida → dedup (4.4) → chama o **mesmo** `WebhookService.processEvolutionEvent(payload)`. O endpoint HTTP **continua existindo** (dual-run; fallback documentado).
- Kill-switch: `QUEUE_CONSUMER_ENABLED=false` desliga o consumer sem redeploy (rollback da Fase 1).
- `prefetch` moderado (10–20); erro de processamento → `nack` sem requeue → DLQ.
- `/health` reporta o estado da conexão AMQP (informativo, não bloqueia o healthcheck do container).

### 4.4 Dedup de boundary (a peça que torna o dual-run seguro)

No dual-run cada evento chega 2× (webhook + fila); na fila, redelivery também acontece. Idempotência **por evento**:

| Evento | Reprocessar é seguro? | Ação |
|---|---|---|
| `messages.upsert`, `send.message` | ❌ `rpush` duplicaria histórico | **Dedup obrigatório** |
| `messages.update` (ACK) | ✅ CAS Lua só avança status | Sem dedup |
| `connection.update`, `contacts.*`, `presence.update` | ✅ `set`/projeção idempotente | Sem dedup |

- `EventDedupService`: `SET NX` em `evt:dedup:{instancia}:{key.id}` (TTL 300 s). Chave nova em `RedisKeys` (`packages/shared`).
- Aplicado **nos dois boundaries do painel** (controller HTTP e consumer AMQP) antes de processar `messages.upsert`/`send.message` — quem chegar primeiro vence; a cópia é descartada com log `evt.dedup-hit fonte=<amqp|webhook>`.
- **Escopo:** o dedup protege o *painel*. O caminho do N8N é protegido pela sequência do cutover (§7.1), não por este dedup.

### 4.5 Engine N8N multi-tenant (substitui o clone por cliente)

O workflow atual da Shkgroup é o protótipo: ele já parametriza `instanceName` em vários nós e usa uma credencial Evolution global. O engine v1 é a sua **generalização**, nascido para a fila:

```
[RabbitMQ Trigger: nexus.n8n.events]
        │
[Entrada] normaliza payload; extrai instancia/evento/jid
        │
[Config Resolver] lê tenant:cfg:<instancia> do Redis
        │        └── config ausente → NACK p/ DLQ + alerta (tenant sem config NUNCA é atendido às cegas)
[Gate de IA] humanControlUntil (canônica + cru @lid) — exceção self-chat: fromMe && remoteJid/remoteJidAlt == sender
        │
[Comandos admin] self-chat do dono → parser /help, /tpl, on/off... (templates e admin vêm da config)
        │
[Núcleo de atendimento] buffer por conversa (Redis) → transcrição → AI Agent
        │                (persona/system prompt da config; memória Redis por tenant+contato)
[Módulos por flag] followup, sheets/CRM, pagamentos (MP) — ligados por tenant na config
        │
[Resposta via Evolution] instanceName dinâmico, credencial global
```

- **Todo hardcode do fluxo atual vira config** (§4.6) ou deriva do payload: o `IF - Msg para mim mesmo?` compara com `sender` (ownerJid injetado pela Evolution em todo evento) — o número fixo `5511912839594` **morre**; a comparação usa `remoteJid`/`remoteJidAlt`, robusta a `@lid`.
- **Registro honesto sobre o gate antigo:** o comentário em `webhook.service.ts` documenta que o gate interno anterior *"lia o `humanControlUntil` correto e respondia assim mesmo"*. O gate do engine difere em **posição**: cabeça do fluxo, caminho único (fila → entrada → config → gate), antes de buffer/espera/resposta. Como o histórico recomenda ceticismo, o **teste de bloqueio é critério de saída obrigatório da Fase 2** (§7) — o corte do webhook (Fase 3) não acontece sem essa prova.
- **Tenants com fluxo custom (hoje: Geotech/Jobson, com tools próprias):** ficam **fora do engine v1** — sem binding na fila, `transport='webhook'`, fluxo próprio intacto. Absorção futura exige "tools por tenant" na config (evolução mapeada, fora de escopo — §11). O alvo continua engine único; o rollout reconhece o transitório.
- Artefato versionado: `docs/n8n-engine-v1.json` (importável). Ativação/desativação de workflows é passo manual do runbook.

### 4.6 Config store por tenant (D9)

- **Fonte de verdade:** tabela nova `tenant_engine_config` no Postgres do painel (migration Drizzle — ⚠️ conferir ordem no `journal`, gotcha conhecido): `instancia` (FK), `config jsonb`, `cfg_version int`, `updated_at`.
- **Write-through:** o service do painel grava Postgres e espelha em `tenant:cfg:<instancia>` (JSON string) na mesma operação; reconciliação Postgres→Redis no boot da API (autocura de drift).
- **O engine lê SÓ o Redis.** Painel morto → atendimento segue com a config viva; apenas a *edição* fica indisponível (aceitável e documentado).
- **Conteúdo v1** (inventário fechado na Fase 0 a partir do fluxo real): persona/system prompt do agente; templates do `/tpl` (texto/imagem/caption); flags de módulo (`followup`, `sheets`, `payments`); IDs externos (planilhas); timezone; parâmetros de buffer/timeout. `ownerJid`/admin **não** entra — deriva do `sender` do payload.
- **Piloto:** seed da Shkgroup via script/SQL. UI de edição fica **fora de escopo** (§11) — o plano não deve inventar tela.
- Flag `transport` (`webhook`|`amqp`) permanece no tenant registry existente; flip **via SQL no piloto** (endpoint/tela fora de escopo). `tenants.n8nWebhookUrl` segue em uso pelo forwarder durante a transição e **aposenta por tenant** quando o binding assume (§7.1).

---

## 5. Fluxo de dados (alvo, pós-migração)

**Mensagem de cliente:** WhatsApp → Evolution → publica `shkgroup.messages.upsert` → (a) `nexus.panel.events` → consumer → dedup → histórico/realtime/UI; (b) `nexus.n8n.events` → engine → config resolver → gate (Redis) → buffer → agente (persona da config) → resposta via Evolution → evento `send.message` → painel grava como resposta da IA.

**Comando admin (self-chat):** dono manda `/help` pra si mesmo → `messages.upsert` (`fromMe=true`, `remoteJid==sender`) → engine → gate deixa passar (exceção self-chat, por tenant, sem hardcode) → parser → resposta com os comandos/templates **da config daquele tenant**. **Painel fora do ar não afeta este caminho.**

**Onboarding de tenant novo (modelo SHK):** criar instância na Evolution + `rabbitmq/set` (manual, com aval) → inserir `tenant_engine_config` (espelha no Redis) → binding `<inst>.messages.upsert` na `nexus.n8n.events` → flip `transport='amqp'`. **Nenhum workflow novo é criado.**

---

## 6. Modos de falha e recuperação

| Cenário | Comportamento | Recuperação |
|---|---|---|
| Painel cai (crash-loop, deploy ruim) | Atendimento segue (config/gate no Redis); `nexus.panel.events` acumula | Painel volta → drena a fila; histórico completo |
| N8N cai | Painel segue; `nexus.n8n.events` acumula | N8N volta → drena em ordem |
| RabbitMQ cai | Evolution não entrega | Runbook: reabilitar webhook da instância; alarme via watchdog |
| Mensagem venenosa | `nack` → DLQ; engine não trava | Watchdog avisa no WhatsApp; replay manual pós-correção |
| Tenant sem config chega ao engine | NACK → DLQ + alerta (nunca atende às cegas) | Corrigir config/binding; replay |
| Config drift Postgres×Redis | Reconciliação no boot da API; `cfg_version` no log do engine | Autocura; divergência visível |
| Dual-run: evento duplicado no painel | Dedup boundary descarta a 2ª cópia | — (por design) |
| Cutover: IA responde 2×, evento sumir ou backlog re-respondido | Prevenido pela **sequência obrigatória do cutover** (§7.1): fila pré-declarada → **purga** → flip → ativar engine | Rollback = sequência inversa |

---

## 7. Rollout — fases, critérios de saída, rollback

| Fase | Entrega | Critério de saída | Rollback |
|---|---|---|---|
| **0 — Infra + validação + inventário** | RabbitMQ no EasyPanel; envs na Evolution; `rabbitmq/set` na `Shkgroup` (manual, com aval); fila de inspeção; **pré-declara `nexus.n8n.events` + binding shkgroup** (§7.1); **inventário completo dos hardcodes do fluxo atual → schema da config v1** | Payload e routing key reais documentados; fila do engine existe e acumula (profundidade crescente é **esperada** nas Fases 0–1); schema de config aprovado | Desligar `RABBITMQ_ENABLED` |
| **1 — Painel dual-run + config store** | Módulo `queue/` + dedup + kill-switch em produção; migration `tenant_engine_config` + write-through + reconcile + seed Shkgroup | ≥ 3 dias com paridade webhook×fila (contadores por fonte); config da Shkgroup íntegra no Redis | `QUEUE_CONSUMER_ENABLED=false` |
| **2 — Engine v1 + cutover piloto** | Engine construído e testado com **fixtures de payload real** (execução manual no N8N); cutover na **sequência do §7.1** | **(a) Exceção:** `/help` e `/tpl` no self-chat OK; **(b) Bloqueio:** takeover ativo → IA silencia, com contato canônico **e** `@lid`; **(c)** conversa ponta a ponta OK; **(d) Regressão por módulo** (buffer/áudio/followup/sheets/MP) contra o comportamento do fluxo v1; **(e)** fluxo não depende de eventos não-message que o forwarder entregava por tabela; 48 h sem anomalia | Sequência inversa do §7.1 (workflow v1 reativado) |
| **3 — Corte do webhook + onboarding modelo** | Webhook da `Shkgroup` desabilitado (manual, com aval); painel 100% fila; **runbook de onboarding O(1)** (§5); próximos tenants modelo-SHK migram por config+binding+flip | 1 semana estável; **teste de bloqueio (2b) repetido por tenant migrado**; um tenant novo onboardado sem criar workflow | Reabilitar webhook |
| **4 — Resiliência operacional** | DLQ + watchdog N8N → alerta WhatsApp; runbook final; `/health` com AMQP | Alarme testado com falha simulada | — |

### 7.1 Sequência obrigatória do cutover (Fase 2) — por que a ordem importa

O cutover são **três ações manuais em três superfícies distintas** (purga na management UI do RabbitMQ, flip via SQL, ativação na UI do N8N); não há atomicidade. A ordem errada duplica resposta (engine ativo com forwarder ainda ligado — o dedup do painel não cobre o N8N), perde evento (flag flipada com fila inexistente — exchange descarta) ou re-responde backlog antigo (engine drenando dias de fila que o v1 já atendeu). Sequência que elimina os três:

1. **Pré-condição (Fase 0):** fila `nexus.n8n.events` + binding declarados. Mensagens acumulam mesmo sem consumidor — profundidade crescente nas Fases 0–1 é **comportamento esperado** (tudo ali está sendo respondido pelo v1 via forwarder).
2. **Purga da fila** (management UI) **imediatamente seguida do passo 3** — sem a purga, o engine drenaria dias de backlog já respondido (IA re-responderia conversas inteiras).
3. **Flip `transport='amqp'`** (SQL): forwarder para de entregar ao N8N; novas mensagens ficam **seguras na fila**. *Trade-off documentado:* mensagens na janela de segundos entre purga e flip são respondidas 2× (v1 via forwarder + engine ao drenar) — raro e aceitável; a ordem inversa **perderia eventos**, violando o requisito do incidente.
4. **Ativa o engine** no N8N: drena a fila em ordem (segundos de buffer, não dias).

Rollback exatamente inverso: desativa engine → flip `transport='webhook'` (workflow v1 volta a responder) → purgar a fila antes de eventual nova tentativa.

---

## 8. Observabilidade

- Logs estruturados no consumer do painel: `evt.consumed`, `evt.dedup-hit`, `evt.nack-dlq` (com `instancia`, `event`, `fonte`).
- Engine loga `instancia` + `cfg_version` por execução — regressão de config visível.
- Fase 1: contadores Redis por fonte (`evt:count:{fonte}:{instancia}:{event}`, TTL 7 d) — incrementados **antes** do descarte por dedup (contando depois, "paridade" seria inalcançável por construção).
- Management UI: profundidade da `nexus.panel.events` é o indicador "painel fora do ar"; da `nexus.n8n.events`, "N8N fora do ar" (pós-Fase 2).
- Watchdog (Fase 4): fluxo N8N agendado — DLQ > 0 ou filas crescendo anormalmente → WhatsApp do dono via Evolution.

## 9. Testes

- **Unit (painel):** `EventDedupService` (NX/TTL, só eventos não-idempotentes); consumer → `processEvolutionEvent` (spy); forwarder respeita `transport`; write-through + reconcile da config.
- **Integração:** RabbitMQ efêmero (Testcontainers/compose) + **payload real capturado** (fixture do pinData) publicado no exchange → assert de histórico gravado e dedup em publicação dupla.
- **Engine:** execuções manuais no N8N com fixtures reais (mensagem comum, self-chat comando, `@lid`, mídia/áudio) + checklist de regressão por módulo (Fase 2d). O engine é testado **antes** do cutover, com o v1 ainda atendendo.
- **E2E produção:** embutido nos critérios de saída das fases (§7).

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Payload/routing key da fila divergirem do assumido | Fase 0 valida com fila de inspeção antes de qualquer código depender; entrada do engine e bindings são os pontos únicos de correção |
| **Regressão comportamental na reescrita do fluxo** (risco novo do "direto pro engine") | Inventário completo na Fase 0; fixtures de payload real; checklist de regressão por módulo (2d); piloto na **nossa** instância; workflow v1 preservado para rollback instantâneo |
| IA responder 2×, evento sumir ou backlog re-respondido na transição | Sequência obrigatória do cutover (§7.1): fila pré-declarada → **purga** → flip → ativar engine |
| RabbitMQ vira novo SPOF | Filas duráveis + volume persistente; webhook preservado como fallback; broker não recebe deploy de feature |
| Mexer na Evolution quebrar o fluxo atual | Passos manuais, com aval, reversíveis, no runbook |
| Config drift / tenant sem config | Write-through + reconcile no boot; engine NACKa tenant sem config (DLQ + alerta) |
| Migration Drizzle fora de ordem | Conferir `journal` + teste de boot local |

## 11. Fora de escopo (YAGNI explícito)

- **Tools por tenant no engine** (necessário para absorver a Geotech/Jobson) — evolução mapeada; até lá, tenants custom ficam no fluxo próprio via forwarder.
- **UI de edição da config** — piloto usa seed via SQL/script.
- **N8N queue mode (workers horizontais)** — gatilho documentado: latência de fila sustentada; não é pré-requisito do piloto nem de ~dezenas de tenants.
- **Sharding da Evolution** — ver §13; preocupação real de 500 instâncias, mas projeto separado.
- Cluster/HA do RabbitMQ; retry automático de DLQ; endpoint/tela admin de `transport`.

## 12. Estrutura do PR (showcase)

Branch `feat/desacoplamento-rabbitmq` → PR único contra `worktree-macos-reskin`, commits em ordem narrativa:

1. `docs(spec)` — esta spec (com histórico do review multi-agente).
2. `feat(shared)` — `RedisKeys` (dedup, `tenant:cfg`) + tipos (`transport`, config).
3. `feat(api)` — migrations (`transport`, `tenant_engine_config`) + forwarder condicionado.
4. `feat(api)` — config store (write-through + reconcile + seed) com testes.
5. `feat(api)` — módulo `queue/` (consumer + dedup + kill-switch) com testes.
6. `feat(n8n)` — `docs/n8n-engine-v1.json` (engine multi-tenant: entrada, config resolver, gate, comandos, núcleo, módulos por flag).
7. `docs(runbook)` — fases operacionais, cutover §7.1, onboarding O(1), passos manuais da Evolution, fallback.

Corpo do PR: problema (incidente de 12/07 + limite do clone-por-cliente) → diagrama de/para → link pra spec → checklist das fases com evidências (paridade, `/help`, teste de bloqueio, onboarding de tenant sem workflow).

## 13. Capacidade — os números de 500 clientes

Ordem de grandeza: 500 tenants × ~200 msg/dia ≈ **100 k eventos/dia ≈ 1,2/s média, picos 10–20/s**.

| Componente | Veredito em 500 | Observação |
|---|---|---|
| RabbitMQ single-node | 🟢 Folga de ordens de magnitude | Milhares de msg/s no hardware do EasyPanel |
| Engine N8N (main única) | 🟢→🟡 | Execuções são I/O-bound (LLM/Evolution); ao saturar, ligar queue mode + workers (§11, gatilho documentado) |
| Redis | 🟢 | Já serve buffer/estado hoje; config adiciona leituras O(1) |
| Postgres | 🟢 | Config é baixa escrita; histórico não passa por ele |
| **Evolution API** | 🔴 **Gargalo real** | ~500 sessões Baileys num container = RAM/CPU proibitivos. **Sharding horizontal**: N containers Evolution, cada um com um subconjunto de instâncias, **todos publicando no mesmo exchange** — o design desta spec já suporta múltiplos producers sem mudança. Projeto separado (provisioning/routing de instância→shard) |

Isolamento/LGPD: namespacing por instância já vigente (`chat:<inst>:...`, `tenant:cfg:<inst>`) se mantém no engine; fila multi-tenant transporta payloads que o broker não interpreta — o isolamento é aplicado no processamento, como hoje no painel multi-tenant.
