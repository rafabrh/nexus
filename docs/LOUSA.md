# 🧭 LOUSA — Programa de escala NEXUS (500 clientes × ~10k chats)

> Snapshot vivo do programa. Atualizado a cada fatia entregue. Fonte detalhada: `docs/superpowers/plans/2026-08-01-nexus-programa-escala-roadmap.md` (CRONOGRAMA VIVO).
>
> **Última atualização:** 2026-08-05 (sessão de handoff — construído o **tooling de teste** do canal GO: instrumentação de captura + latência + seed de validação. Testes verdes, commitado. Falta rodar o teste ao vivo, o que é passo do Rafa. Ver **▶️ RETOMAR AQUI** abaixo.)
> **Branch de prod:** `worktree-macos-reskin` (deploy EasyPanel `siteshkgroup`)

Legenda: ✅ em prod · 🔵 entregue/PR aberto · 📋 plano escrito · ⏳ só HLD · 🔒 portão manual do Rafa

---

## ▶️ RETOMAR AQUI (próxima sessão)

**Onde paramos:** fechando a Fase 0 — "terminar os testes e os steps da migração antes" de tocar a Shkgroup. O canal GO essencial já foi validado ao vivo (passo 8). Nesta sessão construí o **tooling pra medir o loop GO→painel→n8n** e deixei tudo pronto pra você rodar o teste.

**✅ Construído e commitado nesta sessão (código puro, seguro, flags OFF por padrão):**
- **`GO_CAPTURE=true`** (env do nexus-api) → loga o payload AMQP cru (`evt.capture`) pra fechar o shape do `presence` sem chutar. Ligar janela curta num nº de teste (LGPD), desligar após.
- **`GO_LATENCY=true`** → loga `evt.latency ... proc_ms=<painel> wa_lag_ms=<WhatsApp→fila>` por evento. **`wa_lag_ms` é o número do "latência baixa"** (transporte GO→broker→consumer).
- **`apps/api/src/tenant-config/seed/validate-go-loop.sql`** → aponta `nexus_teste` pro n8n do **vtdryfit** + cria `tenant_user` de login (login por e-mail, sem senha).
- Testes: 14/14 do consumer verdes + `tsc` limpo. RUNBOOK §"Flags" documenta os 2 flags.

**🔒 Pra você rodar o teste (próxima vez no PC):**
1. `nexus-api` env: `GO_LATENCY=true` (+ `GO_CAPTURE=true` se for capturar o presence junto) → redeploy.
2. Rodar `validate-go-loop.sql` no Postgres (preencher a URL do n8n do vtdryfit + um e-mail de teste que NÃO seja de outra instância).
3. Mandar msg pro número da `nexus_teste` → logar no painel com esse e-mail → ver conversa + IA respondendo.
4. Ler latência: `docker logs $API | grep evt.latency` (ver [[reference_prod_ssh_access]]).

**⚠️ Dependência descoberta (pode precisar de ajuste no n8n, não no painel):** o reuse do n8n do vtdryfit cabeia só a **ida** (GO→painel→n8n). A **volta** (resposta da IA) só cai na conversa da `nexus_teste` se o workflow do vtdryfit responder pela `instance` **do payload** (instance-aware). Se tiver número/instância hardcoded, a IA responde no número do vtdryfit → ajustar no n8n (`docs/n8n-workflow-atual.md`). Comentado no topo do seed.

**Decisões travadas nesta sessão:**
- **presence** = **capturar ao vivo primeiro** (não codar contra shape assumido). Presence NÃO vai pro n8n (é sinal de UI), então é ortogonal ao teste de latência.
- **vtdryfit** = reusar o **workflow n8n** dele como downstream do teste.
- **Cutover real** será na **Shkgroup** (número da própria SHK), mas **só DEPOIS** dos testes passarem. Identificador que o Rafa passou: `4E8A8AA87C97-47F7-A0F5-33F2013930B2` (**formato de UUID incompleto — confirmar o `instanceId` real ao vivo antes de seedar**).

**Próximos BUILDS de código (após o teste):**
- **(a) Fix do presence** — destrava assim que o Rafa colar o payload capturado (`evt.capture`): fixture real + branch no `normalizeGo` + `handlePresenceUpdate` aceitando o shape GO (espelhar `handleContactUpdate`).
- **(b) Rota B — onboarding GO pelo painel** — pra o cutover da Shkgroup virar um scan pelo painel (sem SQL manual). Lacunas mapeadas: `createInstance` do adapter GO gera token mas não persiste; `onboarding.createInstance` aborta em `probeState=unknown` (fail-safe que protege a prod Node). Fazer com TDD preservando a proteção do Node.

---

## Onde estamos (visão de 10 segundos)

| Etapa | Título | Estado |
|---|---|---|
| **1** | Fundação de escala — Tiering do Redis | ✅ **em prod** |
| **2** | Contrato + barramento (desacoplamento) | ✅ **software 4/4 em prod (2.1→2.4)** — **executando a Fase 0** 🔒 ← *aqui* |
| 3 | Gateway híbrido (Cloud API) | 🅿️ **ADIADA** (decisão de produto: só Evo GO; broadcast futuro via Evolution rate-limited, plano avançado, controlado pela SHK) |
| 4 | Engine próprio (Go) + IA plugável | ⏳ HLD |
| 5 | Migração + descomissionamento do N8N | ⏳ HLD |

**Próximo passo:** fechar a **Fase 0** — passo 7 (gates de robustez, código) + passo 8 (cabear AMQP/consumer, 🔒 EasyPanel). Isso liga o canal Evolution GO em paralelo (número de teste), com a produção Node intacta. Depois: Etapa 4 (engine Go + IA). Cloud API **adiada**.

### 🔓 Fase 0 — progresso (destravada em 2026-08-03)
Estava travada na **licença GO** (OAuth Google, código single-use). Diagnóstico refeito (relógio e HTTP/HTTPS eram falsos alarmes; causa = código gasto no passo manual) → Rafa ativou pelo Manager. Daí:

| Passo | Estado |
|---|---|
| 1–3 · Infra + parear nº teste | ✅ RabbitMQ+EvoGO no ar, licença `active`, `nexus-teste` pareada |
| 4 · Capturar payloads reais | ✅ 14 shapes via WebSocket in-house (texto/imagem/áudio/sticker/reação/link/receipt, 1:1 e grupo) |
| 5 · Fixtures + normalizer reais | ✅ **em prod** `afd93ce` — corrige bug que **dropava 100% dos receipts** (shape real ≠ @provisional) |
| 6 · `EvolutionGoAdapter` (dialeto REST) | ✅ **em prod** `e0e5d6f` — probeState degrada p/ `unknown` (gate #4-2.4 ✔) |
| 7 · Gates de robustez | ✅ **em prod** — #2 retry/DLQ (`3bc1cb3`) · #3 impedância shape v1↔GO (`1d581ab`) · #4 cache `tenants.get` (`a28ceb4`) · #4-2.4 probeState (`e0e5d6f`) |
| 8 · Ligar canal GO (transporte + consumer) | ✅ **VALIDADO AO VIVO (essencial)** — seed feito, consumer ligado, teste de conversa 2026-08-05 ponta a ponta: mensagens/receipts/histórico OK, **DLQ=0** (nenhuma falha). Bug dos guards HTTP-only resolvido (`c275f11`/`eb0613d`/`586bdc7`). Known-gaps: `presence.update` (normalizer lê `data.Info` inexistente no presence GO — nice-to-have) + confirmação visual no painel (criar `tenant_user` de teste) |

---

## ✅ Feito

### Etapa 1 — Tiering do Redis — ✅ EM PROD (`ab63833`, PR #19)
Archive do `chathistory` no Postgres (write-behind) + LTRIM atômico (Lua, anti-perda) + leitura tiered (Redis quente / Postgres frio por `seq`) + backfill único + flags de rollout (default OFF).
🔒 *Runbook de ativação pendente do Rafa:* backfill → validar amostragem de WAMIDs → ligar `ARCHIVE_ENABLED` → ligar `LTRIM_ENABLED` → desligar `BACKFILL_CHATHISTORY`.

### Etapa 2 · Fatia 2.1 — NEXUS Event v1 + normalizer — ✅ EM PROD (`4cc6d6d`, PR #20)
Contrato `NexusEventV1` + `normalizeGatewayEvent(raw, ctx)` (função pura, Node=identidade, GO=mapeamento whatsmeow→v1) + fixtures douradas + `RedisKeys.evtDedup/evtCount`. 33 testes verdes.
⚠️ Fixtures GO `@provisional` até captura de payload real na Fase 0.

### Etapa 2 · Fatia 2.2 — Módulo `queue/` (consumer RabbitMQ) — ✅ EM PROD (`98d06e4`, PR #22)
`apps/api/src/queue/`: `EventDedupService` (dedup por tipo, SET NX 48h) + `NormalizeContextProvider` (Node completo; seam GO pronto) + `EvolutionQueueConsumer` (`@RabbitSubscribe nexus.panel.events` → normalize→dedup→`processEvolutionEvent`, nack→DLX) + `QueueModule` **gated** por `QUEUE_CONSUMER_ENABLED`+`RABBITMQ_URL`. Boundary HTTP também normaliza (fallback `v1 ?? payload`, sem regressão).
**Auditoria `/hm-engineer`** (1 crítico, 3 altos, 2 médios, 1 baixo) → **4 corrigidos**: release do dedup na falha (anti-perda), guard de `msgId` vazio, `nodeNormalizeContext` movido p/ shared, `evtCount` (observabilidade). **361 testes verdes.**

### Etapa 2 · Fatia 2.3 — Config store por tenant — ✅ EM PROD (`91e6671`, PR #23)
Plano: `docs/superpowers/plans/2026-08-02-tenant-config-store.md` (8 tasks TDD).
Migration `0005` (`tenant_engine_config` + `gateway`/`transport` no registry, D7) + `RedisKeys.tenantCfg` + `TenantEngineConfigRepository` + **`InMemoryGatewayConfigStore`** (impl SÍNCRONA) + `TenantConfigService` (write-through Redis + reconcile boot/periódico) + `TenantConfigModule` (sempre-on) + **seam GO cabeado** no QueueModule → o branch GO do normalizer resolve `instanceId→instancia` e `ownerJid` + seed SQL. **Decisão-chave:** seam é **síncrono** (normalizer puro) → snapshot em memória hidratado do Postgres (não I/O por evento). Finding #3 (shape) e ativação seguem gate de Fase 0. **376 testes apps/api + 34 shared, lint ok.**
**Destrava:** Fatia 2.4 (`EvolutionClient` port por `tenant.gateway`) + engine GO-native (lê Redis).

---

### Etapa 2 · Fatia 2.4 — `EvolutionClient` port + 2 adapters — ✅ EM PROD (`c5b2c27`, PR #24)
Plano: `docs/superpowers/plans/2026-08-03-evolution-client-port.md` (subagent-driven, 4 implementers).
Port `EvolutionGateway` (superfície extraída) + `EvolutionNodeAdapter` (client atual 1:1) + `EvolutionGoAdapter` (@provisional na entrega; preenchido na Fase 0/passo 6) + **`EvolutionClient` vira router** (mesmo token, delega por `gatewayFor(instancia)` do snapshot da 2.3 → **consumidores inalterados**). Auditoria `/hm-engineer`: **0 crítico/alto, 1 médio + 2 baixos (todos gated/Fase 0)** → SHIPPA. Fechou a **Etapa 2 no software 🟢**.

### Fase 0 · passos 5–6 — normalizer real + adapter GO — ✅ EM PROD (`afd93ce`, `e0e5d6f`)
Payloads GO **capturados** (WebSocket, número de teste) → `go.fixtures.ts` reescrito (16 casos reais/sanitizados) + `normalizeGo` corrigido (ISO→epoch, receipt `data.*`/`MessageIDs[]`/`state`, @lid via `RecipientAlt`/`SenderAlt`, canoniza device `:NN`) — **corrige bug que dropava 100% dos receipts**. `EvolutionGoAdapter` preenchido com o dialeto REST real (envio pelo token da instância; `/send/media` usa `url`; sem `/send/audio`; métodos sem equivalente GO degradam; **probeState→`unknown`**) + `instanceToken` na config (jsonb, sem migration) + `goCredentials` no store. **409 testes apps/api + 41 shared, tsc limpo.**

---

## 🔒 Portões manuais (dependem do Rafa) — Fase 0 e ativações

- ✅ **Infra + captura (passos 1–6):** feito — RabbitMQ+EvoGO no ar, licença `active`, número pareado, payloads reais capturados, fixtures/normalizer/adapter em prod.
- ✅ **Passo 7 — gates de robustez: COMPLETO** (código em prod; e2e do #2 valida quando o broker subir):
  - ✅ **#2 retry vs DLQ** (`3bc1cb3`) — quorum queue `x-delivery-limit` (default 5) + `requeueErrorHandler`: retry contado pela fila, DLQ só após N. e2e gated no broker.
  - ✅ **#3 impedância de shape v1-GO** (`1d581ab`) — `normalizeGoMessageBody` reescreve casing whatsmeow→Baileys nos nós de mídia + base64 inline; `handleContactUpdate` aceita array Node e objeto v1-GO; connection emite `state`.
  - ✅ **#4 cache de `tenants.get`** (`a28ceb4`) — `getCached` (Redis TTL 60s, invalida nas mutações; guardas seguem lendo DB fresco).
  - ✅ **#4-2.4 probeState → `unknown`** (`e0e5d6f`) — no adapter GO.
- 🔵 **Passo 8 — canal GO: transporte OK + Caminho A no código.**
  - **Descoberta (captura ao vivo):** a Evolution GO 0.7.2 **NÃO usa exchange** — publica no **default exchange** (routing key = nome da fila), em filas por evento minúsculas (`message`/`receipt`/`presence`/`connected`/`loggedout`/`contact`/`pushname`), quorum **sem DLX**. Isso invalidou o desenho antigo (exchange `evolution` + fila `nexus.panel.events`). Também: `AMQP_SPECIFIC_EVENTS` da GO é **case-sensitive** → env capitalizada (`Message,Receipt,…`); `AMQP_URL` **sem barra final** (vhost `/`); `CONNECT_ON_STARTUP=false` derruba a sessão a cada redeploy.
  - **Transporte CONFIRMADO ao vivo:** filas GO encheram (`message:21, receipt:11, pushname:10, connected:1`).
  - **Caminho A implementado** (`55dfa89`, spec `f090510`): consumer assina as filas GO no default exchange (passivo); cap de retry app-side via `x-delivery-count` → `nexus.panel.events.dlq` (as filas GO não têm DLX, então o #2 broker-native foi substituído por isto). `normalizeGo` já falava o corpo AMQP. apps/api 455 + shared 65 verdes.
  - 🔒 **Falta Rafa (deploy):** seed `2.3-go-tenant.sql` (`instancia=nexus_teste` [underscore], `go_uuid=22a04a5a-…`, `owner=5511982704692@s.whatsapp.net`, `instanceToken=8b897ea…`) → `RABBITMQ_URL=amqp://nexus:%40Ricky22033@siteshkgroup_rabbitmq:5672` + `QUEUE_CONSUMER_ENABLED=true` no nexus-api → deploy. As ~21 msgs drenam. Flip `gateway='go'`/`transport='amqp'` só no cutover (§7.1).
- **Runbook do Tiering (Etapa 1):** ativar archive/LTRIM em prod (backfill-primeiro).

---

## 🧱 Princípios travados (não re-litigar)
- Event-driven (RabbitMQ) é o backbone; gRPC só no control plane interno painel↔engine.
- Hexagonal: gateway (`node`|`go`) e IA (`LLMProvider`) são ports substituíveis.
- Engine próprio em **Go** substitui o N8N; canal híbrido (Evolution GO no 1:1 + Meta Cloud API no broadcast).
- Custo mínimo é requisito de 1ª classe (dev solo).
- Postgres = fonte de verdade; caminho quente de mensagem **não** passa síncrono pelo Postgres; nunca sobrescrever chave que o N8N escreve.
- Identidade canônica de instância = **nome do painel/registry** (a GO entra como `instanceId`, nunca como chave).

---

## 📌 PRs / refs
- PR #19 — Tiering (Etapa 1) — **mergeado** (`ab63833`).
- PR #20 — NEXUS Event v1 (Fatia 2.1) — **mergeado** (`4cc6d6d`).
- PR #22 — Módulo queue/ (Fatia 2.2) — **mergeado** (`98d06e4`).
- PR #23 — Config store (Fatia 2.3) — **mergeado** (`91e6671`).
- PR #24 — EvolutionClient port (Fatia 2.4) — **mergeado** (`c5b2c27`).
- Fase 0 (passos 5–6) — push direto em `worktree-macos-reskin`: `afd93ce` (normalizer/fixtures), `e0e5d6f` (adapter GO).
- Runbook da Fase 0: `docs/RUNBOOK-fase-0.md`.
- HLD de escala: `docs/superpowers/specs/2026-08-01-nexus-plataforma-escala-hld-design.md`
- Spec de desacoplamento (v3): `2026-07-17-desacoplamento-rabbitmq-design.md`
