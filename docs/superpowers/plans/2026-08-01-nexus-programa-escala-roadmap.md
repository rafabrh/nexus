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

| Etapa | Estado |
|---|---|
| 1 — Tiering do Redis | 📋 plano escrito, aguarda execução |
| 2 — Contrato + barramento | ⏳ spec pronta (desacoplamento) |
| 3 — Gateway híbrido | ⏳ HLD |
| 4 — Engine + IA | ⏳ HLD |
| 5 — Migração + descom. | ⏳ HLD |

**Perf fixes** (commit `5f947aa`) e **spec HLD** (commit `e493b15`) já feitos; falta `push` (branch de deploy — decisão do Rafa).
