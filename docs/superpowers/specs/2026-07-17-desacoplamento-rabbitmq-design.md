# Desacoplamento do caminho crítico via RabbitMQ — Evolution → {Painel, N8N}

**Data:** 2026-07-17
**Status:** Aprovado — pronto para plano de implementação
**Autor:** Rafa (rafabrh) + Claude

---

## 1. Contexto e problema

Em 12/07/2026 o deploy de uma feature de UI (quick-reply com mídia) colocou a API do painel em crash-loop (`@fastify/multipart` v9 × Fastify 4). Consequência real: **o atendimento IA de todos os clientes ficou morto por 5 dias** — e ninguém foi avisado.

O motivo é estrutural, não acidental. A Evolution API entrega webhooks **ao painel**, e é o painel que reencaminha cada evento ao N8N (`n8n-forwarder.service.ts`):

```
Evolution ──webhook──► PAINEL (hub) ──forwarder──► N8N (fluxo de atendimento)
                          └── Redis/Postgres (histórico, gate de IA, realtime)
```

O painel é o componente que **mais recebe deploy** (toda feature nova) e está no caminho crítico do serviço que paga as contas. Qualquer regressão na API derruba o atendimento — e o webhook da Evolution "tenta e desiste": eventos do período de indisponibilidade **se perdem**.

### Requisito (do incidente)

> "Nenhum ponto do fluxo pode morrer e o atendimento deve funcionar independente da interface."

Traduzido em engenharia: **o atendimento (Evolution → N8N) não pode depender do painel estar de pé**, e uma indisponibilidade de qualquer consumidor não pode perder eventos.

---

## 2. Decisões travadas

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Mecanismo de desacoplamento | **RabbitMQ** (integração nativa da Evolution v2.3.7) |
| D2 | Onde roda o broker | **EasyPanel, projeto `siteshkgroup`** (mesma rede interna de painel/N8N/Redis) |
| D3 | Estratégia de migração | **Dual-run com dedup, piloto na instância `Shkgroup`** (a nossa), depois replica |
| D4 | Consumer do painel | Módulo NestJS novo reusando `WebhookService.processEvolutionEvent()` — zero lógica duplicada |
| D5 | Cutover do N8N | Workflow v2 clonado com **RabbitMQ Trigger + nó Code chamado "Webhook"** (adapter) — nenhuma expressão do fluxo muda |
| D6 | Gate de IA (`humanControlUntil`) | Migra pro fluxo N8N (Redis direto, chaves canônica+cru via `rawJid`), **mantendo a exceção do self-chat** (canal admin) |
| D7 | Roteamento por tenant | Flag `transport` (`webhook` \| `amqp`) no tenant registry dirige o forwarder durante a transição |
| D8 | Showcase | **PR único** (spec + implementação) contra `worktree-macos-reskin`, branch `feat/desacoplamento-rabbitmq` |

---

## 3. Arquitetura alvo

```
Evolution v2.3.7 ──publica──► RabbitMQ (exchange topic "evolution_exchange")
                                  │
                    ┌─────────────┴──────────────────┐
             nexus.panel.events              nexus.n8n.<instancia>   (1 fila por tenant)
                    │                                │
             PAINEL (consumer NestJS)         N8N (RabbitMQ Trigger, fluxo v2)
             histórico/realtime/UI            atendimento IA + comandos admin
```

### Matriz de falhas — hoje vs. alvo

| Se morrer... | Hoje | Alvo |
|---|---|---|
| **Painel (API)** | 🔴 Tudo morre; eventos perdidos | 🟢 Atendimento segue; eventos do painel **acumulam na fila** e são processados na volta |
| **N8N** | 🔴 Atendimento morre | 🟡 Atendimento pausa; mensagens **esperam na fila do tenant** (nada se perde) |
| **RabbitMQ** | — | 🟡 Runbook de fallback: reabilitar webhook da Evolution (mecanismo mantido); broker é infra estável, **sem deploy de feature** |
| **Evolution** | 🔴 Morre tudo | 🔴 Inevitável (é a conexão WhatsApp) — fora de escopo |
| **Redis** | 🔴 Fluxo N8N quebra | 🔴 Inalterado — fora de escopo |

Propriedade nova e central: **buffer durável**. Consumidor fora do ar deixa de significar evento perdido; significa evento adiado.

---

## 4. Componentes

### 4.1 Broker (RabbitMQ no EasyPanel)

- Serviço novo no projeto `siteshkgroup` (imagem oficial `rabbitmq:3-management`), volume persistente, acessível na rede interna (`http://siteshkgroup_rabbitmq:5672`, management UI protegida).
- **Exchange:** `evolution_exchange` (topic) — nome default da integração da Evolution; declarado pelo producer.
- **Filas** (duráveis, mensagens persistentes). Quem declara: a `nexus.panel.events` é declarada pelo consumer NestJS no boot; a `nexus.n8n.<tenant>` é **pré-declarada manualmente** na management UI (Fase 0, §7.1) — e seus argumentos (durable, DLX `nexus.dlx`) **devem casar** com o que o RabbitMQ Trigger do N8N assere ao ativar, senão o passo 4 do cutover falha com `PRECONDITION_FAILED` (falha segura — mensagens seguem acumulando — mas evitável):
  - `nexus.panel.events` — bindings dos eventos que o painel processa hoje (`<inst>.messages.upsert`, `<inst>.send.message`, `<inst>.messages.update`, `<inst>.connection.update`, `<inst>.contacts.*`, `<inst>.presence.update`).
  - `nexus.n8n.shkgroup` — bindings só do que o fluxo consome (`shkgroup.messages.upsert`). Fila única por tenant preserva **ordem FIFO** (importante pro buffer de conversa do fluxo).
  - DLX `nexus.dlx` + filas `*.dlq` — mensagem que estourar tentativas cai na DLQ (replay manual documentado no runbook; sem retry automático — YAGNI).

### 4.2 Producer — Evolution API v2.3.7

- Envs no container da Evolution: `RABBITMQ_ENABLED=true`, `RABBITMQ_URI=amqp://...`, `RABBITMQ_EXCHANGE_NAME=evolution_exchange`, `RABBITMQ_GLOBAL_ENABLED=false` (eventos por instância).
- Por instância: `POST /rabbitmq/set/{instance}` com a lista de eventos (mesma lista do webhook atual + os do painel).
- Payload publicado = **mesmo shape do webhook** (`event`, `instance`, `data`, `sender`, `server_url`, ...). Routing key esperada: `<instancia>.<evento>` em minúsculas. **Ambos serão validados na Fase 0 com fila de inspeção** — divergência de *payload* é absorvida no adapter (4.5); divergência de *routing key* se corrige nos **bindings** (4.1). Ambas documentadas aqui.
- ⚠️ **Regra operacional:** toda mudança na Evolution (env, `/rabbitmq/set`, webhook) é **passo manual executado com aprovação explícita do Rafa** — nunca automatizada por agente (config de webhook N8N é sagrada; ver runbook §7).

### 4.3 Consumer do painel (`apps/api/src/queue/`)

- Lib `@golevelup/nestjs-rabbitmq` (reconexão, retry e decorators prontos — padrão da comunidade NestJS).
- `EvolutionQueueConsumer` (`@RabbitSubscribe` na `nexus.panel.events`): valida → dedup (4.4) → chama o **mesmo** `WebhookService.processEvolutionEvent(payload)` do webhook HTTP. O endpoint HTTP **continua existindo** (dual-run; fallback documentado).
- Kill-switch: `QUEUE_CONSUMER_ENABLED=false` desliga o consumer sem redeploy de código (rollback da Fase 1).
- `prefetch` moderado (10–20); erro de processamento → `nack` sem requeue → DLQ.
- `/health` passa a reportar o estado da conexão AMQP (não bloqueia o healthcheck do container — informativo).

### 4.4 Dedup de boundary (a peça que torna o dual-run seguro)

No dual-run cada evento chega 2× (webhook + fila); na fila, redelivery também acontece. Análise de idempotência **por evento**:

| Evento | Reprocessar é seguro? | Ação |
|---|---|---|
| `messages.upsert`, `send.message` | ❌ `rpush` duplicaria histórico | **Dedup obrigatório** |
| `messages.update` (ACK) | ✅ CAS Lua só avança status | Sem dedup |
| `connection.update`, `contacts.*`, `presence.update` | ✅ `set`/projeção idempotente | Sem dedup |

- `EventDedupService`: `SET NX` em `evt:dedup:{instancia}:{key.id}` (TTL 300 s, cobre janela de dual-run + redelivery). Chave nova em `RedisKeys` (`packages/shared`).
- Aplicado **nos dois boundaries** (controller HTTP e consumer AMQP) antes de processar `messages.upsert`/`send.message` — quem chegar primeiro vence, a cópia é descartada com log `evt.dedup-hit fonte=<amqp|webhook>`.

### 4.5 N8N — workflow v2 (cutover sem refatorar)

O fluxo atual tem dezenas de expressões `$('Webhook').item.json.body.X`. O workflow v2 (clone do atual) troca só a cabeça:

```
[RabbitMQ Trigger: nexus.n8n.shkgroup]
        │
[Code chamado "Webhook"]  ← return [{ json: { body: $json } }]
        │
(resto do fluxo INTACTO — toda expressão $('Webhook')...body.X continua válida)
```

- O nó Code **assume o nome "Webhook"** — as referências por nome resolvem para ele. Zero refactor, rollback = reativar o workflow antigo.
- **Gate de IA interno (D6):** novo nó logo após o adapter checa `humanControlUntil` no Redis (chave canônica **e** cru `@lid` via mapa `rawJid` que o painel mantém), com a **exceção do self-chat do dono** (`fromMe` && `remoteJid`/`remoteJidAlt` == `sender`): comando admin nunca é gated (paridade com o fix `0223966` do painel).
- **Registro honesto sobre o gate antigo:** o comentário em `webhook.service.ts` documenta que o gate interno anterior *"lia o `humanControlUntil` correto e respondia assim mesmo"* — a falha não era (só) chave errada. O gate v2 difere em **posição**: fica na cabeça do fluxo, antes de buffer/espera/qualquer resposta, num caminho único (fila → adapter → gate), eliminando as rotas que contornavam a checagem. Como o histórico recomenda ceticismo, o **teste de bloqueio é critério de saída obrigatório da Fase 2** (§7) — o corte do webhook (Fase 3) não acontece sem essa prova.
- Artefato versionado: `docs/n8n-workflow-v2-amqp.json` (importável). Ativação/desativação de workflows é passo manual do runbook.

### 4.6 Tenant registry — flag `transport`

- Migration Drizzle nova (⚠️ conferir ordem no `journal` — gotcha de 07/2026): coluna `transport text NOT NULL DEFAULT 'webhook'` em `tenants`.
- `n8n-forwarder`: tenant com `transport='amqp'` **não recebe forward** (o N8N dele já consome da fila; evita resposta duplicada da IA). Com `'webhook'`, comportamento atual intacto.
- Flip por tenant **via SQL direto no piloto** (endpoint/tela admin fica explicitamente fora de escopo — o plano não deve inventar rota) — é o botão do cutover (Fase 2) e do rollback.

---

## 5. Fluxo de dados (alvo, pós-migração)

**Mensagem de cliente:** WhatsApp → Evolution → publica `shkgroup.messages.upsert` → (a) fila do painel → consumer → dedup → histórico/realtime/UI; (b) fila do N8N → trigger → adapter → gate de IA (Redis) → buffer → agente → resposta via Evolution → evento `send.message` → painel grava como resposta da IA.

**Comando admin (self-chat):** dono manda `/help` pra si mesmo → `messages.upsert` (`fromMe=true`, `remoteJid==sender`) → fila do N8N → gate deixa passar (exceção self-chat) → `IF - Msg para mim mesmo?` → parser de comandos → resposta. **O painel fora do ar não afeta este caminho** — requisito do incidente atendido.

---

## 6. Modos de falha e recuperação

| Cenário | Comportamento | Recuperação |
|---|---|---|
| Painel cai (crash-loop, deploy ruim) | Atendimento segue; `nexus.panel.events` acumula | Painel volta → drena a fila; histórico completo |
| N8N cai | Painel segue; `nexus.n8n.*` acumula | N8N volta → drena em ordem |
| RabbitMQ cai | Evolution não entrega (integração AMQP falha) | Runbook: reabilitar webhook da instância (mecanismo preservado); alarme via watchdog |
| Mensagem venenosa (payload inesperado) | `nack` → DLQ; fluxo não trava | Watchdog avisa no WhatsApp; replay manual pós-correção |
| Dual-run: evento duplicado | Dedup boundary descarta a 2ª cópia | — (por design) |
| Cutover: IA responde 2× ou evento perdido | Prevenido pela **sequência obrigatória do cutover** (§7.1) — o dedup do painel NÃO cobre o caminho do N8N | Rollback = sequência inversa |

---

## 7. Rollout — fases, critérios de saída, rollback

| Fase | Entrega | Critério de saída | Rollback |
|---|---|---|---|
| **0 — Infra + validação** | RabbitMQ no EasyPanel; envs na Evolution; `rabbitmq/set` na `Shkgroup` (manual, com aval); fila de inspeção; **pré-declara `nexus.n8n.shkgroup` + bindings na management UI** (exchange sem fila bound DESCARTA mensagem — §7.1) | Payload e routing key reais documentados nesta spec; fila do N8N existe e acumula | Desligar `RABBITMQ_ENABLED` |
| **1 — Painel dual-run** | Módulo `queue/` + dedup + kill-switch em produção | ≥ 3 dias com paridade webhook×fila (contadores por fonte, sem divergência) | `QUEUE_CONSUMER_ENABLED=false` |
| **2 — Cutover N8N (piloto Shkgroup)** | Workflow v2 ativo + `transport='amqp'`, na **sequência do §7.1** | **(a) Exceção:** `/help` e `/tpl` no self-chat OK; **(b) Bloqueio:** takeover ativo → IA silencia, testado com contato canônico **e** `@lid`; **(c)** conversa de teste ponta a ponta OK; **(d)** fluxo não depende de eventos não-message que o forwarder entregava por tabela (`connection.update`, `contacts.*`); 48 h sem anomalia | Sequência inversa do §7.1 |
| **3 — Corte do webhook** | Painel 100% fila; webhook da instância desabilitado (manual, com aval); replica fases 2–3 nos demais tenants | 1 semana estável por tenant migrado; **teste de bloqueio (2b) repetido por tenant** | Reabilitar webhook |
| **4 — Resiliência operacional** | DLQ + watchdog N8N → alerta WhatsApp; runbook final; `/health` com AMQP | Alarme testado com falha simulada | — |

### 7.1 Sequência obrigatória do cutover (Fase 2) — por que a ordem importa

O cutover são **duas ações manuais** (SQL + UI do N8N); não há atomicidade. A ordem errada duplica resposta (workflow v2 ativo com forwarder ainda ligado — o dedup do painel não cobre o N8N) ou perde evento (flag flipada com fila inexistente — exchange descarta). Sequência que elimina os dois:

1. **Pré-condição (feita na Fase 0):** fila `nexus.n8n.shkgroup` + bindings declarados. A partir daí, mensagens acumulam mesmo sem consumidor — a **profundidade crescente desta fila nas Fases 0–1 é comportamento esperado** (não "corrigir" no dashboard); tudo que acumula ali está sendo respondido pelo v1 via forwarder.
2. **Purga da fila** (management UI) **imediatamente seguida do passo 3** — sem a purga, o v2 drenaria dias de backlog que o v1 já respondeu (IA re-responderia conversas inteiras).
3. **Flip `transport='amqp'`** (SQL): forwarder para de entregar ao N8N; novas mensagens ficam **seguras na fila**. *Trade-off documentado:* mensagens que chegarem na janela de segundos entre purga e flip serão respondidas 2× (uma vez pelo v1 via forwarder, uma vez pelo v2 ao drenar) — aceitável e raro; a ordem inversa (flip → purga) **perderia eventos**, o que viola o requisito do incidente.
4. **Ativa o workflow v2** no N8N: drena a fila em ordem (segundos de buffer, não dias).

Rollback exatamente inverso: desativa v2 → flip `transport='webhook'` → (fila volta a acumular sem consumidor; purgar antes de eventual nova tentativa, documentado no runbook).

---

## 8. Observabilidade

- Logs estruturados no consumer: `evt.consumed instancia=<i> event=<e> fonte=amqp`, `evt.dedup-hit`, `evt.nack-dlq`.
- Fase 1: contadores Redis por fonte (`evt:count:{fonte}:{instancia}:{event}`, TTL 7 d) para o relatório de paridade — incrementados **antes** do descarte por dedup (contando depois, "paridade" seria inalcançável por construção: uma fonte sempre perde a corrida).
- Management UI do RabbitMQ (profundidade de fila, taxa) — a profundidade da `nexus.panel.events` é o novo indicador "painel fora do ar".
- Watchdog (Fase 4): fluxo N8N agendado — DLQ > 0 ou fila do painel crescendo → WhatsApp do dono via Evolution.

## 9. Testes

- **Unit:** `EventDedupService` (NX/TTL, só eventos não-idempotentes); consumer → `processEvolutionEvent` (spy); forwarder respeita `transport`.
- **Integração:** RabbitMQ efêmero (Testcontainers/compose) + **payload real capturado** (fixture do pinData do fluxo) publicado no exchange → assert de histórico gravado e dedup em publicação dupla.
- **E2E produção:** embutido nos critérios de saída das fases (§7).

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Payload/routing key da fila divergirem do assumido | Fase 0 valida com fila de inspeção **antes** de qualquer código depender; adapter é ponto único de correção |
| IA responder 2× ou evento sumir durante transição | Sequência obrigatória do cutover (§7.1): fila pré-declarada → flip → ativar v2 |
| RabbitMQ vira novo SPOF | Filas duráveis + volume persistente; webhook preservado como fallback; broker não recebe deploy de feature |
| Mexer na Evolution quebrar o fluxo atual | Todos os passos na Evolution são manuais, com aval, reversíveis e listados no runbook |
| Migration Drizzle fora de ordem | Conferir `journal` (gotcha conhecido do repo) + teste de boot local |

## 11. Fora de escopo (YAGNI explícito)

- Cluster/HA do RabbitMQ (single-node com volume atende a escala atual).
- Mover mídia de quick-reply pra S3/MinIO (envio manual de mídia continua dependendo do painel — caminho de interface, não de atendimento).
- `/health` checar Postgres (débito conhecido, rastreado à parte).
- Retry automático de DLQ (replay manual no runbook).

## 12. Estrutura do PR (showcase)

Branch `feat/desacoplamento-rabbitmq` → PR único contra `worktree-macos-reskin`, commits em ordem narrativa:

1. `docs(spec)` — esta spec.
2. `feat(shared)` — `RedisKeys.evtDedup` + tipo `transport`.
3. `feat(api)` — migration `transport` + forwarder condicionado.
4. `feat(api)` — módulo `queue/` (consumer + dedup + kill-switch) com testes.
5. `feat(n8n)` — `docs/n8n-workflow-v2-amqp.json` (trigger AMQP + adapter "Webhook" + gate interno).
6. `docs(runbook)` — fases operacionais, passos manuais da Evolution, fallback.

Corpo do PR: problema (incidente de 12/07) → diagrama de/para → link pra spec → checklist das fases com evidências (prints de paridade, teste do `/help`).
