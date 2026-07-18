# Desacoplamento via RabbitMQ + Engine N8N multi-tenant + Evolution GO — escala 500 clientes

**Data:** 2026-07-17 (v2 2026-07-18: N8N tocável + escala explícita; v3 2026-07-18: **Evolution GO como gateway-alvo desde o início**)
**Status:** Aprovado (review ciclo v3 concluído em 2026-07-18)
**Autor:** RaFa (rafabrh)

---

## 1. Contexto e problema

Em 12/07/2026 o deploy de uma feature de UI (quick-reply com mídia) colocou a API do painel em crash-loop. Consequência real: **o atendimento IA de todos os clientes ficou morto por 5 dias** — e ninguém foi avisado. O motivo é estrutural: a Evolution entrega webhooks **ao painel**, e o painel reencaminha ao N8N (`n8n-forwarder.service.ts`). O painel — o componente que mais recebe deploy — está no caminho crítico, e o webhook "tenta e desiste" (eventos se perdem).

Há um segundo problema estrutural, de **escala de operação**: um workflow N8N clonado por cliente, cheio de hardcodes. Em 500 clientes: 500 artefatos vivos, drift inevitável, onboarding manual.

E um terceiro, de **plataforma**: o gateway atual (Evolution API Node v2.3.7, Baileys) tem custo de RAM por sessão que inviabiliza 500 instâncias por container. A Evolution Foundation mantém a sucessora **Evolution GO** (Go + whatsmeow): footprint por sessão em outra ordem de grandeza, S3/MinIO nativo para mídia, LID nativo (`SenderAlt`) e **AMQP/RabbitMQ nativo** — alinhada exatamente a esta arquitetura. Decisão do negócio: **planejar a migração GO-first**, com a Node como legado de transição, não como alvo.

### Requisitos

1. **Resiliência:** atendimento (gateway → N8N) não depende do painel; indisponibilidade de consumidor não perde evento.
2. **Escala:** 500 clientes com esforço operacional O(1) por tenant (onboarding = configuração; correção = 1 deploy).
3. **Plataforma:** gateway-alvo Evolution GO; a arquitetura trata o gateway como **detalhe substituível** (a transição Node→GO não pode reescrever consumidores).

---

## 2. Decisões travadas

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Mecanismo de desacoplamento | **RabbitMQ** (nativo nos dois gateways: Node v2.3.7 e GO) |
| D2 | Onde roda o broker | **EasyPanel, projeto `siteshkgroup`** |
| D3 | Piloto | **Instância `Shkgroup`** (a nossa); número de TESTE dedicado valida a GO antes de qualquer produção |
| D4 | Consumer do painel | Módulo NestJS novo reusando `WebhookService.processEvolutionEvent()` |
| D5 | Modelo do fluxo N8N | **Engine único multi-tenant**, nascido **GO-native** (consome NEXUS v1; envia no dialeto GO) |
| D6 | Gate de IA | No engine (Redis, canônica+cru), exceção self-chat via `ownerJid` — **sem hardcode** |
| D7 | Roteamento por tenant | Registry ganha `gateway` (`node`\|`go`) e `transport` (`webhook`\|`amqp`); bindings explícitos por tenant migrado |
| D8 | Showcase | **PR único** contra `worktree-macos-reskin`, branch `feat/desacoplamento-rabbitmq` |
| D9 | Config store | **Postgres = fonte de verdade → write-through Redis; engine lê SÓ Redis** |
| D10 | Fila do engine | **Única multi-tenant** (`nexus.n8n.events`) |
| D11 | **Gateway-alvo** | **Evolution GO** (whatsmeow) desde o início do rollout; Node = legado de transição por tenant, descomissionada ao final |
| D12 | **Contrato interno de eventos** | Shape atual (Node) batizado de **NEXUS Event v1** (tipos versionados em `packages/shared`); normalizer **GO→v1** na borda; consumidores só falam v1 |

---

## 3. Arquitetura alvo

```
Evolution GO (whatsmeow, AMQP nativo) ──publica──► RabbitMQ (exchange topic)
[Evolution Node = legado, por tenant,      │
 via webhook até re-parear]                │
                     ┌─────────────────────┴───────────────┐
              nexus.panel.events                  nexus.n8n.events (única, multi-tenant)
                     │                                     │
              PAINEL (consumer NestJS)              N8N ENGINE (1 workflow parametrizado)
              [normalizer GO→NEXUS v1]              [entrada normaliza GO→NEXUS v1]
              histórico/realtime/UI                        │
                     │                              config do tenant ◄── Redis (tenant:cfg:*)
              Postgres (fonte de verdade ──write-through──► Redis         ▲
              da config por tenant)                                       │
                                                   gate de IA, buffer, estado (já em Redis)
```

### Matriz de falhas — hoje vs. alvo

| Se morrer... | Hoje | Alvo |
|---|---|---|
| **Painel (API)** | 🔴 Tudo morre; eventos perdidos | 🟢 Atendimento segue; eventos do painel acumulam na fila. Só *edição* de config indisponível |
| **N8N** | 🔴 Atendimento morre | 🟡 Pausa; mensagens esperam na fila (nada se perde) |
| **RabbitMQ** | — | 🟡 Fallback: webhook do gateway (mecanismo existe nos dois); broker sem deploy de feature |
| **Redis** | 🔴 Fluxo quebra | 🔴 Dependência dura já hoje — fora de escopo |
| **Gateway (GO/Node)** | 🔴 Morre tudo | 🔴 Inevitável por instância; GO viabiliza N containers pequenos (blast radius menor, §13) |
| Servidor de licença da GO | — | 🟢 Ativação online 1×; heartbeat tolera longos períodos offline (falha silenciosa, retoma) — risco baixo, documentado |

Propriedades novas: **buffer durável**, **operação O(1) por cliente** e **gateway substituível** (contrato NEXUS v1 na borda).

---

## 4. Componentes

### 4.1 Broker (RabbitMQ no EasyPanel)

- Serviço no projeto `siteshkgroup` (`rabbitmq:3-management`), volume persistente, management UI protegida.
- **Exchange:** o publicado pela GO (naming de exchange/routing key da GO **não é documentado** — validado na Fase 0 com fila de inspeção; os bindings absorvem qualquer padrão).
- **Filas** (duráveis, persistentes). `nexus.panel.events` declarada pelo consumer no boot; `nexus.n8n.events` **pré-declarada manualmente** (argumentos devem casar com o que o RabbitMQ Trigger do N8N assere — mismatch = `PRECONDITION_FAILED`, falha segura):
  - `nexus.panel.events` — bindings de todos os eventos que o painel processa (equivalentes GO: `Message`, `SendMessage`, `Receipt`, `Connected`/`LoggedOut`, `Contact`/`PushName`, `Presence`/`ChatPresence`), todos os tenants.
  - `nexus.n8n.events` — **bindings explícitos por tenant migrado** (mensagens; equivalente GO de `messages.upsert` = `Message`). Adicionar tenant = sequência §7.2. Tenants com fluxo custom não absorvido (Geotech) não têm binding — seguem no legado.
  - DLX `nexus.dlx` + `*.dlq`; replay manual; sem retry automático (YAGNI).
  - **Contingência de roteamento:** se a Fase 0 mostrar que a routing key da GO NÃO discrimina instância (só evento), o design degrada bem — só instâncias migradas publicam na GO, e o NACK-sem-config do engine protege contra tenant inesperado; nesse caso o "remover binding" do rollback §7.2 deixa de existir e o rollback vira só re-pareamento + flip. Registrado para não replanejar na Fase 0.
- **Ordem:** fila única não garante FIFO por conversa sob consumo concorrente — o buffer de conversa em Redis do engine já agrega por contato (preservado).

### 4.2 Producer-alvo — Evolution GO (e o legado Node)

**Evolution GO** (`evolution-foundation/evolution-go`, v0.7.x, Go 1.24 + whatsmeow + Gin/GORM):

- Deploy no EasyPanel: container próprio + Postgres próprio (auth/users; `DATABASE_SAVE_MESSAGES=false`) + MinIO (mídia via `mediaUrl` — aposenta o proxy base64 do painel) + **licença community ativada** (gratuita; ativação online 1×; heartbeat obrigatório e tolerante a offline; telemetria com payloads documentados — dependência ACEITA e registrada).
- Eventos: `AMQP_URL` global + habilitação por instância (`rabbitmqEnable`, `subscribe: [...]`). Retry de entrega: 5× / 30 s.
- **Formato de evento = whatsmeow, incompatível com o Node** — motivo direto da D12: `{event: "Message", data: {Info: {Chat, Sender, SenderAlt, IsFromMe, ID, PushName, Timestamp, MediaType}, Message: {...}}, instanceId (UUID), instanceToken}`.
- **REST = dialeto próprio** (`/message/sendText` com instância no body; `/instance/{name}/qrcode`; etc.) — incompatível com o client atual e com os nós `n8n-nodes-evolution-api`.
- ⚠️ **Pré-1.0 (v0.7.x):** paridade fina de features (citação/reply, áudio PTT, reações, grupos) é **gate duro da Fase 0** com número de teste — sem paridade comprovada, o rollout não avança e o plano B (arquitetura idêntica com a Node como producer, como na v2 desta spec) permanece válido.

**Evolution Node v2.3.7 (legado):** intocada durante a transição — tenants não migrados continuam webhook→painel→forwarder→fluxo v1. **Nenhuma configuração nova é feita na Node** (nem `rabbitmq/set`): menos risco na produção atual. ⚠️ Toda mudança em qualquer gateway é **manual com aval do Rafa**.

### 4.3 Consumer do painel (`apps/api/src/queue/`) — poliglota por construção

- `@golevelup/nestjs-rabbitmq`; `EvolutionQueueConsumer` na `nexus.panel.events`: **normalizer** (4.7) → dedup (4.4) → `WebhookService.processEvolutionEvent(nexusEventV1)` — o service existente não muda.
- Endpoint HTTP atual continua (legado Node) e **também passa pelo `normalizeGatewayEvent`** — custo ~zero (mesma função) e torna o webhook da GO um fallback REAL do painel se o broker cair. Limite honesto: o engine só consome fila; com o broker fora, **a IA pausa até ele voltar** (§6).
- Kill-switch `QUEUE_CONSUMER_ENABLED`; prefetch 10–20; erro → `nack` → DLQ; `/health` reporta AMQP (informativo).
- **Client adapter de saída:** `EvolutionClient` vira port com dois adapters (`node` = client atual; `go` = dialeto novo), selecionado por `tenant.gateway`. Envio de mensagem/mídia/QR do painel funciona nos dois mundos durante a transição.

### 4.4 Dedup de boundary

| Evento (NEXUS v1) | Reprocessar é seguro? | Ação |
|---|---|---|
| `messages.upsert`, `send.message` | ❌ `rpush` duplicaria histórico | **Dedup obrigatório** |
| `messages.update` (ACK) | ✅ CAS Lua só avança | Sem dedup |
| `connection.update`, `contacts.*`, `presence.update` | ✅ idempotentes | Sem dedup |

- `SET NX` em `evt:dedup:{instancia}:{event}:{key.id}` — evento na chave (o `send.message` e o eco `messages.upsert` compartilham `key.id` e ambos devem passar; o dedup mata só duplicata do MESMO evento). **TTL 48 h**: o rollback da Fase 1 (kill-switch com backlog acumulando por horas/dias) drena pelo dedup ao religar. Aplicado após a normalização (chaveia por NEXUS v1, independente do gateway).
- Runbook: religar consumer após kill-switch prolongado nas Fases 1–2 = purgar `nexus.panel.events` antes — seguro **porque a fila só carrega tráfego do número de TESTE** nessas fases (perda aceitável por definição), não por haver redundância; a produção Node segue por webhook e nunca passa pela fila até a Fase 3. **A partir da Fase 3 a fila é fonte única do painel para tenants GO: purga proibida.**
- Escopo: protege o *painel*. O caminho do N8N é protegido pelas sequências §7.1/§7.2.

### 4.5 Engine N8N multi-tenant — GO-native

```
[RabbitMQ Trigger: nexus.n8n.events]
        │
[Entrada/Normalizer] payload GO → NEXUS Event v1 (espelho da função de 4.7); extrai instancia (via 4.6), evento, jid
        │
[Config Resolver] tenant:cfg:<instancia> (Redis) — ausente → NACK p/ DLQ + alerta (nunca atende às cegas)
        │
[Gate de IA] humanControlUntil (canônica + cru @lid) — exceção self-chat: IsFromMe && Chat/SenderAlt == ownerJid(config)
        │
[Comandos admin] /help, /tpl, on/off... (templates/admin da config)
        │
[Núcleo] buffer por conversa (Redis) → transcrição → AI Agent (persona da config; memória por tenant+contato)
        │
[Módulos por flag] followup, sheets/CRM, pagamentos — por tenant
        │
[Resposta] HTTP Request no dialeto GO (baseUrl/apikey global GO; legado node coberto pelo adapter apenas no painel — tenants do engine são, por definição, GO)
```

- **Todo hardcode do fluxo atual vira config** ou deriva do evento. O `IF - Msg para mim mesmo?` (hardcode `5511912839594`) morre: comparação com `ownerJid` da config (a GO **não tem** o campo `sender` no evento — ver 4.6/4.7).
- **Registro honesto sobre o gate antigo:** o gate interno anterior "lia o `humanControlUntil` correto e respondia assim mesmo" (comentário em `webhook.service.ts`). O gate do engine difere em **posição** (cabeça do fluxo, caminho único). Ceticismo mantido: **teste de bloqueio é critério de saída obrigatório** (§7) antes de qualquer corte.
- **Tenants custom (Geotech/Jobson):** fora do engine v1 (tools por tenant = evolução §11); permanecem no legado Node até lá.
- Artefato: `docs/n8n-engine-v1.json`. Ativação/desativação manual (runbook).

### 4.6 Config store por tenant

- Tabela `tenant_engine_config` (migration Drizzle — conferir `journal`, gotcha conhecido): `instancia`, `config jsonb`, `cfg_version`, `updated_at`. Write-through → `tenant:cfg:<instancia>` (Redis); reconcile no boot.
- **Conteúdo v1** (inventário fecha na Fase 0): persona/prompt; templates `/tpl`; flags de módulo; IDs externos; timezone; buffer/timeouts; **e os campos exigidos pela GO:** `instanceId` (UUID GO) e **`ownerJid`** (a GO identifica eventos por `instanceId`/`instanceToken`, sem nome de instância nem `sender` — o normalizer resolve `instanceId→instancia` e o gate/self-chat usa `ownerJid` da config; mapa espelhado no Redis junto com a config). **`gateway` mora SÓ no tenant registry** (uma fonte de verdade; o espelho Redis da config replica o valor derivado do registry, nunca o contrário — sem dupla escrita).
- **Chave canônica de `instancia`:** o nome usado hoje (ex.: `Shkgroup`, casing do painel/registry) segue sendo a identidade em todo o sistema — a GO entra como atributo (`instanceId`), nunca como chave.
- Piloto: seed via SQL/script; UI fora de escopo. Flip de `gateway`/`transport` via SQL no piloto (endpoint/tela fora de escopo).

### 4.7 NEXUS Event v1 — o contrato interno (D12)

- **Definição:** o shape que painel e fluxo já falam (`{event: 'messages.upsert', instance, data: {key: {remoteJid, remoteJidAlt, fromMe, id}, pushName, message, messageTimestamp}, sender, ...}`) é promovido a **contrato versionado**: tipos + docs em `packages/shared` (`NexusEventV1`).
- **Normalizer `normalizeGatewayEvent(raw, ctx) → NexusEventV1`** (função pura em `packages/shared`, tabela de testes dourada com fixtures reais dos dois gateways):
  - Node → identidade (validação de shape apenas).
  - GO → mapeamento: `Message→messages.upsert`, `SendMessage→send.message`, `Receipt(Delivered|Read)→messages.update`, `Connected/LoggedOut→connection.update`, `Contact/PushName→contacts.update`, `Presence/ChatPresence→presence.update`; campos `Info.Chat→key.remoteJid`, `Info.SenderAlt→key.remoteJidAlt` (LID nativo), `Info.IsFromMe→key.fromMe`, `Info.ID→key.id`, `Info.PushName→pushName`, `Info.Timestamp→messageTimestamp`, e `Info.Sender→key.participant` quando `Info.IsGroup` (remetente dentro do grupo); `ctx` resolve `instanceId→instancia` e injeta `sender=ownerJid` (config 4.6) para manter o contrato v1 íntegro.
  - **Descartes explícitos (logados, não é NACK — fora de contrato por design):** `Receipt(ReadSelf)` (leitura própria em outro device — sem equivalente v1), `QRCode` (pareamento é coberto pelo REST do adapter, e o `connection.update` v1 não carrega QR), calls, labels, newsletter, `HistorySync` (salvo decisão do §7.1 passo 4).
- **Onde roda:** no consumer do painel (import direto) e **espelhada no nó de entrada do engine** (mesma lógica, mesmos fixtures). Duplicação controlada de UMA função pura testada — sem microserviço novo no caminho crítico; se surgir um 3º consumidor, promove-se a normalizer-worker (§11).

---

## 5. Fluxo de dados (alvo)

**Mensagem de cliente:** WhatsApp → **Evolution GO** → publica evento `Message` no exchange → (a) `nexus.panel.events` → normalizer → dedup → histórico/realtime/UI; (b) `nexus.n8n.events` → engine (normaliza) → config → gate → buffer → agente → **resposta via REST GO** → evento `SendMessage` → painel grava como resposta da IA.

**Comando admin (self-chat):** dono manda `/help` pra si → `Message` com `Info.IsFromMe=true`, `Info.Chat==ownerJid` → engine → exceção do gate → parser → responde com comandos/templates da config. **Painel fora do ar não afeta.**

**Onboarding de tenant novo (modelo SHK):** criar instância **na GO** + parear QR + habilitar AMQP da instância (manual, com aval) → config (`instancia`, `instanceId`, `ownerJid`, persona...) → binding → `transport='amqp'`, `gateway='go'`. **Nenhum workflow novo; nenhuma instância Node nova.**

---

## 6. Modos de falha e recuperação

| Cenário | Comportamento | Recuperação |
|---|---|---|
| Painel cai | Atendimento segue; `nexus.panel.events` acumula | Drena na volta |
| N8N cai | Painel segue; `nexus.n8n.events` acumula | Drena na volta |
| RabbitMQ cai | GO não entrega via AMQP (retry 5×/30 s ajuda em blips) | Painel: fallback webhook GO (normalizado — §4.3). Engine: **IA pausa até o broker voltar**. Alerta §8 |
| GO cai / licença | Instâncias daquele container offline; heartbeat tolera offline longo | Restart; N containers pequenos limitam blast radius |
| Payload venenoso / tenant sem config | `nack` → DLQ + alerta | Replay pós-correção |
| Evento GO fora do contrato v1 | Descarte logado no normalizer (por design) | — |
| Config drift | Reconcile no boot; `cfg_version` logado | Autocura |
| Duplicata por redelivery AMQP / replay de DLQ | Dedup 48 h descarta | — |
| Consumer religado pós kill-switch | Backlog drena pelo dedup 48 h | Fases 1–2: purga de `nexus.panel.events` antes (fila só carrega teste); Fase 3+: purga proibida (fonte única) |
| RabbitMQ fora com tenants GO em produção (Fase 3+) | Painel pode voltar ao webhook GO (normalizado no boundary HTTP — §4.3); **a IA pausa até o broker voltar** (engine só consome fila) — honesto e documentado | Restaurar broker; alerta de vivacidade (§8) |
| Cutover piloto: 2×/perda/backlog | Sequência §7.1 | Inversa |
| Migração de tenant (engine ativo) | Sequência §7.2 — purga/desativação proibidas | Rollback por tenant |

---

## 7. Rollout — fases, critérios de saída, rollback

| Fase | Entrega | Critério de saída | Rollback |
|---|---|---|---|
| **0 — Infra + validação GO + inventário** | RabbitMQ; **Evolution GO deployada** (Postgres, MinIO, licença ativada); **número de TESTE pareado na GO**; AMQP habilitado; fila de inspeção; pré-declara `nexus.n8n.events` + binding do teste; inventário de hardcodes → schema config v1 | **Naming AMQP + payload real da GO documentados** (as fixtures douradas do normalizer e o engine dependem de payload CAPTURADO, não assumido — front-carregar); **checklist de paridade PASSA** (texto, mídia in/out, áudio PTT, citação/reply, reação, ACKs, self-chat, LID, **grupos** — msgs de grupo não quebram histórico/engine e o gate os ignora corretamente); comportamento do sync pós-pareamento validado (§7.1 passo 4) — reprovou = plano B (v2 desta spec, producer Node) sem mudar arquitetura; schema aprovado | Desligar container GO |
| **1 — Painel poliglota (paralelo com número de teste)** | Consumer + **normalizer GO→v1** (também no boundary HTTP) + dedup + kill-switch; config store + seed (teste e Shkgroup); registry `gateway`; client adapter GO | Número de teste ponta a ponta no painel (histórico/realtime/envio); produção Node intocada e saudável; paridade de processamento das fixtures douradas | Kill-switch |
| **2 — Engine v1 GO-native (ainda sem produção)** | Engine consumindo eventos do número de teste; config resolver; gate; comandos; núcleo; módulos por flag; envio via REST GO | **(a)** `/help`/`/tpl` self-chat no número de teste; **(b) Bloqueio:** takeover → IA silencia (canônico e `@lid`); **(c)** conversa e2e; **(d)** regressão por módulo vs fluxo v1 (fixtures); **(e)** confirmado que o engine só precisa dos eventos com binding | Desativar engine (teste não é produção) |
| **3 — Cutover do piloto Shkgroup** | Purga da fila do engine → flip `transport='amqp'`+`gateway='go'` → **re-parear a Shkgroup na GO** (QR; janela de minutos, fora de horário) → engine assume; webhook Node da Shkgroup desabilitado após estabilizar | `/help`/`/tpl` e bloqueio ao vivo; 48 h sem anomalia; painel exibindo histórico/realtime da Shkgroup via fila | **Re-parear de volta na Node** + flip reverso (fluxo v1 reativado) |
| **4 — Migração por tenant + onboarding O(1)** | Tenants modelo-SHK migram pela **sequência §7.2 (com re-pareamento)**; novos tenants nascem na GO (§5) | 1 semana estável por tenant; teste de bloqueio por tenant; 1 tenant novo onboardado sem workflow/instância Node | §7.2 rollback por tenant |
| **5 — Descomissionamento Node + resiliência** | Node desligada (Geotech por último, pós tools-por-tenant §11); DLQ + watchdog→WhatsApp; runbook final; `/health` AMQP | Zero tenants na Node (exceto custom documentados); alarme testado com falha simulada | — |

### 7.1 Sequência do cutover do piloto (Fase 3)

Ações manuais em superfícies distintas — sem atomicidade. Ordem que elimina resposta dupla, perda e replay de backlog:

0. **Criar a instância `Shkgroup` na GO** (sem parear) + habilitar AMQP dela (manual, com aval) — sem pareamento, nada é publicado; sem efeito.
1. **Pré-condição (Fase 0):** fila `nexus.n8n.events` + bindings declarados; engine ativo servindo o número de teste (Fase 2).
2. **Criar o binding da Shkgroup NESTE momento** (não antes — evita acúmulo) e **purgar** eventual resíduo (seguro: até aqui a fila só carregou teste).
3. **Flip `transport='amqp'` + `gateway='go'`** (SQL): forwarder para de entregar ao fluxo v1. *Nuance da janela:* entre o flip e o logout da Node (passo 4), a Node ainda entrega webhooks — essas mensagens ganham histórico no painel mas **não chegam ao engine** (sem resposta da IA; aceito pela janela de minutos, fora de horário).
4. **Re-parear a Shkgroup na GO** (QR): eventos fluem GO→fila→engine. Mensagens do gap ficam server-side no WhatsApp e sincronizam ao parear — **a Fase 0 valida** se chegam como `Message` normal ou só como `HistorySync` (que o normalizer descarta); se for só `HistorySync`, decidir mapear ou aceitar a perda do gap ANTES do cutover.
5. Estabilizou (critérios da fase) → desabilitar o webhook Node da Shkgroup (manual, com aval).

Rollback: re-parear de volta na Node → flip reverso → fluxo v1 reativado (engine segue servindo só o teste).

### 7.2 Migração de tenant com engine ATIVO (Fase 4) — purga e desativação PROIBIDAS

A fila compartilhada carrega tráfego vivo. Sequência por tenant: **(1)** criar instância GO do tenant (sem parear) + habilitar AMQP; **(2)** config completa (incl. `instanceId`, `ownerJid`) conferida no Redis; **(3)** binding do tenant **imediatamente antes de** **(4)** flip `transport='amqp'`+`gateway='go'` e **(5)** re-pareamento do chip na GO (mesma janela curta do §7.1 passo 4); **(6)** webhook Node off ao estabilizar. Rollback por tenant: re-parear na Node + flip reverso + **remover o binding** (eventos residuais na fila drenam pelo engine — duplicação breve limitada ao tenant; preferível a purgar a fila de todos). **Nunca** desativar o engine, **nunca** purgar a fila compartilhada.

---

## 8. Observabilidade

- Consumer: `evt.consumed` / `evt.dedup-hit` / `evt.nack-dlq` / `evt.normalizer-drop` (com `instancia`, `event`, `gateway`, `fonte`).
- Engine loga `instancia` + `cfg_version` por execução.
- Fase 1: contadores por fonte (`evt:count:{fonte}:{instancia}:{event}`, TTL 7 d), incrementados **antes** do dedup.
- Management UI: profundidade da `nexus.panel.events` = "painel fora"; `nexus.n8n.events` = "N8N fora".
- **Alerta mínimo de vivacidade já na Fase 3** (não esperar a Fase 5): broker inacessível OU `nexus.n8n.events` sem consumo por N minutos → aviso no WhatsApp do dono (pode ser o próprio fluxo watchdog simples no N8N). Entre as Fases 3 e 4, broker fora de madrugada = perda silenciosa — exatamente o cenário do incidente original.
- Watchdog completo (Fase 5): DLQ > 0 ou fila crescendo anormalmente → WhatsApp do dono.

## 9. Testes

- **Unit:** normalizer (tabela dourada GO→v1 com fixtures reais dos DOIS gateways — o coração do D12); dedup; consumer→service; forwarder×`transport`; client adapter GO; write-through/reconcile.
- **Integração:** RabbitMQ efêmero + fixtures publicadas → histórico gravado; dupla publicação → dedup.
- **Engine:** execuções manuais com fixtures (mensagem, self-chat, `@lid`, mídia, áudio) + regressão por módulo — tudo contra o **número de teste**, produção intocada até a Fase 3.
- **E2E produção:** critérios de saída das fases.

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **Evolution GO pré-1.0** (paridade de features, estabilidade) | Fase 0 é um **gate duro com número de teste** e checklist explícito; plano B preservado (arquitetura idêntica com producer Node — v2 desta spec); GO só toca produção na Fase 3 |
| Naming AMQP / payload GO divergirem do assumido | Fila de inspeção na Fase 0 antes de qualquer código depender; bindings + normalizer são os pontos únicos de correção |
| Re-pareamento por tenant (janela operacional) | Fora de horário; comportamento de sync offline do whatsmeow validado na Fase 0 (§7.1 passo 4); rollback = re-parear de volta |
| Licença/heartbeat/telemetria da GO | Community gratuita; ativação 1×; offline tolerante; payloads de telemetria documentados — dependência aceita e registrada; falha de heartbeat não derruba instância |
| Regressão comportamental na reescrita do fluxo | Inventário Fase 0; fixtures douradas; regressão por módulo; piloto na nossa instância; fluxo v1 preservado |
| 2×/perda/backlog na transição | §7.1 (piloto) / §7.2 (por tenant) |
| RabbitMQ novo SPOF | Filas duráveis; fallback webhook nos dois gateways; broker sem deploy de feature |
| Config drift / tenant sem config | Write-through + reconcile; NACK+alerta |
| Migration Drizzle fora de ordem | Conferir `journal` + boot local |

## 11. Fora de escopo (YAGNI explícito)

- **Tools por tenant no engine** (pré-requisito para absorver Geotech) — evolução mapeada.
- **UI de config / endpoint de flip** — SQL no piloto.
- **Normalizer-worker** dedicado — só se surgir 3º consumidor.
- **N8N queue mode** — gatilho: latência de fila sustentada.
- **Dual-device (mesmo número pareado nos 2 gateways)** — tecnicamente possível via multi-device; validação avançada opcional com o número de teste, NUNCA em produção nesta spec.
- Cluster/HA RabbitMQ; retry automático de DLQ.

## 12. Estrutura do PR (showcase)

1. `docs(spec)` — esta spec (com histórico dos ciclos de review).
2. `feat(shared)` — **NEXUS Event v1** (tipos + `normalizeGatewayEvent` + fixtures douradas) + `RedisKeys` + tipos de registry/config.
3. `feat(api)` — migrations (`gateway`/`transport`, `tenant_engine_config`) + forwarder condicionado.
4. `feat(api)` — config store (write-through + reconcile + seed) com testes.
5. `feat(api)` — módulo `queue/` (consumer + normalizer + dedup + kill-switch) com testes.
6. `feat(api)` — client adapter Evolution GO (port + 2 adapters) com testes.
7. `feat(n8n)` — `docs/n8n-engine-v1.json` (engine GO-native).
8. `docs(runbook)` — fases, §7.1/§7.2 (com re-pareamento), onboarding O(1), passos manuais por gateway, fallback, licença GO.

Corpo do PR: incidente + limite do clone-por-cliente + gargalo Baileys → diagrama de/para → spec → checklist de fases com evidências.

## 13. Capacidade — os números de 500 clientes

500 tenants × ~200 msg/dia ≈ **100 k eventos/dia ≈ 1,2/s média, picos 10–20/s**.

| Componente | Veredito | Observação |
|---|---|---|
| RabbitMQ single-node | 🟢 | Ordens de magnitude de folga |
| Engine N8N | 🟢→🟡 | I/O-bound; queue mode quando saturar (§11) |
| Redis / Postgres | 🟢 | Config = leituras O(1); histórico fora do Postgres |
| **Evolution GO** | 🟢 | whatsmeow tem footprint por sessão em outra ordem de grandeza vs Baileys (validar números reais no piloto — Fase 0/3); N containers pequenos publicando no mesmo exchange (a spec já suporta múltiplos producers) com blast radius limitado |
| Evolution Node | ⚫ descomissionada | Fase 5 |

Isolamento/LGPD: namespacing por instância (`chat:<inst>:`, `tenant:cfg:<inst>`) preservado; fila multi-tenant transporta payloads opacos ao broker — isolamento aplicado no processamento, como hoje.

---

## Referências da investigação (Evolution GO)

- Repo oficial: https://github.com/evolution-foundation/evolution-go (v0.7.2, jul/2026; Go 1.24, whatsmeow, Gin, GORM)
- Docs: https://docs.evolutionfoundation.com.br/evolution-go (webhooks/eventos, ativação, telemetria)
- FAQ licenciamento: https://docs.evolutionfoundation.com.br/licensing/faq (community gratuita; offline tolerante; telemetria obrigatória; Apache 2.0 + marca)
