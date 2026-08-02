# NEXUS — Roadmap-mestre do programa de escala (500 × 10k)

> **Documento-âncora.** Mantém o contexto do programa inteiro para não se perder entre sessões/subagentes. Cada etapa vira um plano próprio (`docs/superpowers/plans/`). Atualize o status ao fim de cada etapa.

**HLD de referência:** `docs/superpowers/specs/2026-08-01-nexus-plataforma-escala-hld-design.md`
**Spec de desacoplamento:** `docs/superpowers/specs/2026-07-17-desacoplamento-rabbitmq-design.md`

---

## Princípios travados (não re-litigar)

- **Event-driven** (RabbitMQ) é o backbone; **gRPC** só no control plane interno painel↔engine (não substitui fila).
- **Hexagonal**: gateway (`MessageGateway`: go|cloud-api) e IA (`LLMProvider`: openai|anthropic|…) são ports substituíveis.
- **Engine próprio em Go** substitui o N8N; **canal híbrido** (Evolution GO no 1:1 + Meta Cloud API no broadcast).
- **Custo mínimo** é requisito de 1ª classe (dev solo).
- **Fronteira de dados:** tabelas Postgres são projeções duráveis write-behind; **nunca** substituem chave que o N8N escreve; caminho quente de mensagem NÃO passa síncrono pelo Postgres (container 256MB).
- **Guardrails:** nunca sobrescrever webhook N8N; migration sempre conferindo `journal`; lint+test antes de commitar; commit local sem push em branch de deploy; identidade `rafabrh` sem trailers do Claude.

## Software 🟢 vs portões manuais 🔒

A pipeline de subagentes implementa o 🟢 ponta a ponta e **pausa** nos 🔒 (que exigem você): subir RabbitMQ e Evolution GO no EasyPanel, parear número WhatsApp (QR), aprovar conta/templates na Meta, ativar licença GO.

---

## As 5 etapas

### Etapa 1 — Fundação de escala 🟢 (SEM infra nova) — **PRIMEIRO**
Destrava os 5M threads sem depender de broker/gateway novos.
- **Tiering do Redis** — plano: `2026-08-01-redis-tiering.md`. Archive de `chathistory` no Postgres (projeção write-behind via keyspace listener) + LTRIM da cauda + leitura tiered (Redis quente / Postgres frio) + backfill + flag de rollout.
- Pré-requisito reconhecido pelo HLD e pelos dois roadmaps.

### Etapa 2 — Contrato + barramento 🟢🔒
Base do desacoplamento; tira o painel do caminho crítico.
- **NEXUS Event v1 + normalizer** (`packages/shared`: tipos + `.proto` + `normalizeGatewayEvent` + fixtures douradas). 🟢 (fixtures GO dependem do spike de payload 🔒).
- **RabbitMQ** deployado 🔒 + **consumer no painel** (`apps/api/src/queue/`: consumer + dedup 48h + kill-switch). 🟢
- Detalhe fino na spec de desacoplamento §4.

### Etapa 3 — Gateway híbrido 🟢🔒
- **Evolution GO** deployada (Postgres, MinIO, licença) 🔒 + **adapter GO** do `MessageGateway` (port + 2 adapters). 🟢
- **Cloud API connector (Go)** + broadcast/campanhas + token-bucket por número 🟢 (conta/templates Meta 🔒).

### Etapa 4 — Engine próprio + IA 🟢🔒
- **Port `LLMProvider`** (adapters OpenAI/Anthropic + budget cap + prompt caching + model tiering). 🟢
- **Engine Go multi-tenant** (buffer por conversa, gate de IA, agente via port, comandos admin, módulos por flag, config via Redis). 🟢 (roda contra número de TESTE 🔒).

### Etapa 5 — Migração + descomissionamento 🟢🔒
- **Cutover por tenant** (spec §7.1/§7.2: re-pareamento, fila viva — purga proibida). 🔒
- **Tela de config do agente** (frontend). 🟢
- **Descomissiona N8N/Node** (Geotech por último). 🔒

---

## Status

Legenda: ✅ feito+merge · 🔵 feito+PR aberto · 📋 plano escrito · ✍️ escrevendo plano · ⏳ spec/HLD só · 🔒 portão manual (Rafa).

| Etapa | Estado |
|---|---|
| 1 — Tiering do Redis | ✅ **em prod** (PR #19 mergeado, `ab63833`) |
| 2 — Contrato + barramento | 🔵 em andamento (1/4 fatias em PR) |
| 3 — Gateway híbrido | ⏳ HLD |
| 4 — Engine + IA | ⏳ HLD |
| 5 — Migração + descom. | ⏳ HLD |

---

## CRONOGRAMA VIVO (fonte única — atualizar a CADA fatia)

> Regra: uma fatia = um plano em `docs/superpowers/plans/` = uma feature branch = um PR contra `worktree-macos-reskin` (prod). Marcar aqui ao concluir. **Não iniciar código sem o plano da fatia escrito e revisado.**

### Etapa 1 — Fundação (Tiering do Redis) — ✅ CONCLUÍDA
- ✅ **Tiering** — plano `2026-08-01-redis-tiering.md`; 8 tasks TDD; PR #19 **mergeado** em prod. Runbook de ativação pendente (backfill→ARCHIVE→LTRIM), 🔒 do Rafa.

### Etapa 2 — Contrato + barramento — 🔵 EM ANDAMENTO (1/4)
- 🔵 **Fatia 2.1 — NEXUS Event v1 + normalizer** — plano `2026-08-02-nexus-event-v1-normalizer.md`; 6 tasks; `packages/shared` (contrato + `normalizeGatewayEvent` + fixtures douradas + `RedisKeys.evtDedup/evtCount`); 33 testes verdes; **PR #20 aberto** (aguarda merge do Rafa). ⚠️ fixtures GO `@provisional` até captura na Fase 0.
- 📋 **Fatia 2.2 — Módulo `queue/` (consumer)** — plano `2026-08-02-queue-consumer.md` (próximo a executar). `apps/api/src/queue/`: `EvolutionQueueConsumer` (@golevelup/nestjs-rabbitmq) → `normalizeGatewayEvent` → dedup (`evtDedup`, SET NX 48h, política por tipo §4.4) → `WebhookService.processEvolutionEvent` + kill-switch `QUEUE_CONSUMER_ENABLED`. Boundary HTTP existente também passa a normalizar. Testes unit; conexão AMQP real 🔒.
- ⏳ **Fatia 2.3 — Config store por tenant** — `tenant_engine_config` (migration Drizzle, conferir journal) + write-through Redis (`tenant:cfg:*`) + reconcile no boot + seed SQL; migrations `gateway`/`transport` no registry (§4.6/D7/D9). 100% testável agora.
- ⏳ **Fatia 2.4 — `EvolutionClient` port + 2 adapters** — port de saída com adapters `node` (client atual) e `go` (dialeto REST GO), selecionado por `tenant.gateway` (§4.3). Testes unit; envio real GO 🔒.
- 🔒 **Fase 0 (infra/captura)** — subir RabbitMQ + Evolution GO (EasyPanel) + parear número de TESTE + capturar payload/naming AMQP real → **trocar fixtures GO `@provisional`** e re-rodar tabela dourada. Gate duro de paridade (§7 Fase 0). **Depende do Rafa.**
- ⏳ **Engine N8N GO-native** (`docs/n8n-engine-v1.json`) — espelha o normalizer no nó de entrada; config resolver/gate/comandos/núcleo (§4.5). Após config store.

### Etapa 3 — Gateway híbrido — ⏳ HLD (vira planos quando a Etapa 2 fechar)
### Etapa 4 — Engine próprio + IA — ⏳ HLD (inclui port `LLMProvider`)
### Etapa 5 — Migração + descomissionamento — ⏳ HLD (cutover §7.1/§7.2, 🔒)

**Já em prod/histórico:** perf fixes, tiering (Etapa 1). **Handoff de retomada:** [[project_roadmap_handoff]] (memória — sempre atualizar ao fim da sessão).
