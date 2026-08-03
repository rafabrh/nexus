# 🧭 LOUSA — Programa de escala NEXUS (500 clientes × ~10k chats)

> Snapshot vivo do programa. Atualizado a cada fatia entregue. Fonte detalhada: `docs/superpowers/plans/2026-08-01-nexus-programa-escala-roadmap.md` (CRONOGRAMA VIVO).
>
> **Última atualização:** 2026-08-03 (Etapa 2 — software 4/4 completo)
> **Branch de prod:** `worktree-macos-reskin` (deploy EasyPanel `siteshkgroup`)

Legenda: ✅ em prod · 🔵 entregue/PR aberto · 📋 plano escrito · ⏳ só HLD · 🔒 portão manual do Rafa

---

## Onde estamos (visão de 10 segundos)

| Etapa | Título | Estado |
|---|---|---|
| **1** | Fundação de escala — Tiering do Redis | ✅ **em prod** |
| **2** | Contrato + barramento (desacoplamento) | 🟢 **software 4/4 (2.1✅ 2.2✅ 2.3✅ 2.4🔵)** — resta Fase 0 🔒 |
| 3 | Gateway híbrido (Evolution GO + Cloud API) | ⏳ HLD |
| 4 | Engine próprio (Go) + IA plugável | ⏳ HLD |
| 5 | Migração + descomissionamento do N8N | ⏳ HLD |

**Próximo passo:** mergear o **PR da Fatia 2.4** → a Etapa 2 fecha no software; o que resta é a **Fase 0 🔒** (infra + captura GO). Depois, planejar a **Etapa 3** (gateway híbrido).

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

### Etapa 2 · Fatia 2.3 — Config store por tenant — 🔵 PR ABERTO
Plano: `docs/superpowers/plans/2026-08-02-tenant-config-store.md` (8 tasks TDD).
Migration `0005` (`tenant_engine_config` + `gateway`/`transport` no registry, D7) + `RedisKeys.tenantCfg` + `TenantEngineConfigRepository` + **`InMemoryGatewayConfigStore`** (impl SÍNCRONA) + `TenantConfigService` (write-through Redis + reconcile boot/periódico) + `TenantConfigModule` (sempre-on) + **seam GO cabeado** no QueueModule → o branch GO do normalizer resolve `instanceId→instancia` e `ownerJid` + seed SQL. **Decisão-chave:** seam é **síncrono** (normalizer puro) → snapshot em memória hidratado do Postgres (não I/O por evento). Finding #3 (shape) e ativação seguem gate de Fase 0. **376 testes apps/api + 34 shared, lint ok.**
**Destrava:** Fatia 2.4 (`EvolutionClient` port por `tenant.gateway`) + engine GO-native (lê Redis).

---

### Etapa 2 · Fatia 2.4 — `EvolutionClient` port + 2 adapters — 🔵 PR ABERTO
Plano: `docs/superpowers/plans/2026-08-03-evolution-client-port.md` (subagent-driven, 4 implementers).
Port `EvolutionGateway` (superfície extraída) + `EvolutionNodeAdapter` (client atual 1:1) + `EvolutionGoAdapter` (@provisional, lança até Fase 0) + **`EvolutionClient` vira router** (mesmo token, delega por `gatewayFor(instancia)` do snapshot da 2.3 → **consumidores inalterados**). Auditoria `/hm-engineer`: **0 crítico/alto, 1 médio + 2 baixos (todos gated/Fase 0)** → SHIPPA. **404 testes apps/api + 34 shared, 0 regressão.** Fecha a **Etapa 2 no software 🟢**.

---

## 🔒 Portões manuais (dependem do Rafa) — Fase 0 e ativações

- **Fase 0 (infra/captura):** subir RabbitMQ + Evolution GO no EasyPanel, parear número de TESTE (QR), habilitar AMQP, pré-declarar `nexus.panel.events` + DLX `nexus.dlx`, **capturar payload/naming GO reais** → trocar fixtures `@provisional` e re-rodar a tabela dourada.
- **Ativar o consumer:** `QUEUE_CONSUMER_ENABLED=true` + `RABBITMQ_URL` só após o broker validado.
- **Gates de robustez pré-ativação (da auditoria da 2.2):**
  - **#2 retry vs DLQ** — hoje falha vai direto ao DLQ sem retry; exige topologia de retry (quorum queue `x-delivery-limit` ou retry-queue+TTL) → depende do broker.
  - **#3 impedância de shape v1-GO ↔ `processEvolutionEvent`** — contacts/connection GO têm shape diferente; consertar contra payload GO **capturado** (não chutar).
  - **#4 cache de `tenants.get`** — 2 queries Postgres por evento; cachear (TTL curto) antes de ligar em escala.
- **Runbook do Tiering (Etapa 1):** ativar archive/LTRIM em prod (backfill-primeiro).
- **Seed/flip de tenant GO:** `instanceId`/`ownerJid` via SQL + `gateway='go'`/`transport='amqp'` só no cutover (§7.1).

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
- PR #22 — Módulo queue/ (Fatia 2.2) — **aberto**, aguarda merge do Rafa.
- HLD de escala: `docs/superpowers/specs/2026-08-01-nexus-plataforma-escala-hld-design.md`
- Spec de desacoplamento (v3): `2026-07-17-desacoplamento-rabbitmq-design.md`
