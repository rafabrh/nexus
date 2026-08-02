# NEXUS — Plataforma de controle de atendimento (HLD, escala 500 × 10k)

**Data:** 2026-08-01
**Status:** Aprovado (design de alto nível — aguarda review multi-agente e writing-plans)
**Autor:** RaFa (rafabrh)
**Nível:** HLD (High-Level Design) — antecede ADRs, FDD/LLD e o plano de implementação.

---

## 0. Sumário executivo

NEXUS é uma plataforma **multi-tenant de controle de atendimento** WhatsApp: inbox omnichannel com **interface forte e controlável** (kanban, chat com paridade WhatsApp, realtime) + **agente de IA configurável por tenant** sob **controle humano** (takeover/gate). O alvo de escala é **500 clientes × ~10k conversas abertas cada (~5M threads de estado)**, com throughput conversacional 1:1 e picos de broadcast.

Este HLD consolida três decisões já aprovadas em brainstorming:

1. **Desacoplamento por RabbitMQ + Evolution GO** (spec `2026-07-17-desacoplamento-rabbitmq-design.md`) como base.
2. **Engine próprio em Go** substituindo o N8N como backend de IA.
3. **Canal WhatsApp híbrido** — Evolution GO (não-oficial) no atendimento 1:1; **Meta Cloud API** (oficial) no broadcast/campanhas.
4. **Camada de IA provider-agnóstica** (port `LLMProvider`) — começa barato (OpenAI `gpt-4o-mini` ou free tier Gemini/Groq), evolui para Claude; provider **e** modelo por tenant. **Custo mínimo é requisito de primeira classe.**

Padrões: **event-driven** (backbone RabbitMQ), **hexagonal/ports-adapters** (gateway e LLM substituíveis), **gRPC + protobuf** no control plane interno, **CQRS-lite** (escrita via eventos→Postgres; leitura Redis quente + Postgres frio), REST/WS na borda pública.

---

## 1. Contexto e visão geral

### 1.1 O que é

Plataforma de **controle de atendimento** onde o operador humano comanda e a IA assiste/atende sob supervisão. O diferencial é a **interface forte e controlável** + a **tela de configuração do agente de IA por tenant** — não é um construtor de fluxos commoditizado (tipo BotConversa), é um painel de controle de atendimento com IA plugável.

### 1.2 Estado atual endereçado (o que evolui/morre)

| Problema atual | Endereçamento |
|---|---|
| Painel no caminho crítico do atendimento (incidente 12/07: 5 dias fora) | **Desacoplado por fila** — painel sai do caminho crítico |
| N8N clonado por cliente (drift, onboarding manual) | **Engine único Go multi-tenant** parametrizado por config |
| Baileys (RAM/sessão inviável em escala) | **Evolution GO** (whatsmeow) no 1:1 |
| Sem canal de broadcast compliant | **Meta Cloud API** para broadcast/campanhas |
| `chathistory` inteiro no Redis | **Tiering**: Redis quente (cauda) + Postgres particionado + object storage |
| IA amarrada a um provedor | **Port `LLMProvider`** plugável, provider/modelo por tenant |

### 1.3 Sistemas/features que se conectam

WhatsApp (via Evolution GO + Meta Cloud API), provedores de LLM (OpenAI/Anthropic/Gemini/Groq via port), Redis, Postgres, MinIO/S3 (mídia), RabbitMQ (bus), frontend Next.js (UI), integrações por tenant (Sheets/CRM/pagamentos — por flag).

---

## 2. Arquitetura geral

### 2.1 Topologia (alto nível)

```
                     ┌──────── Frontend Next.js (UI forte + tela config do agente IA) ────────┐
                     │                          REST + WebSocket                              │
                ┌────┴───────────────────────────────────────────────────────────────────────┴────┐
                │  PAINEL BFF (NestJS/TS) — UI, histórico, realtime, config CRUD, auth, admin        │
                └──▲───────────────▲──────────────────────────────────────────────────▲────────────┘
  consome eventos  │   gRPC control plane (protobuf: NEXUS v1)                          │ write-through
                ┌──┴──────────────┴──────┐                                       ┌──────┴──────┐
 RabbitMQ ◄──────┤  ENGINE (Go, N replicas, stateless)                           │  Postgres   │ (fonte de verdade)
(topic exchange) │  buffer/gate IA/agente(LLM port)/comandos/módulos             └──────▲──────┘
    ▲    ▲       └──▲──────────────┬────────────────────┬────────────┘                  │ particionado/sharded
    │    │          │ lê cfg/estado│ chama LLM           │ envia resposta               │
    │    │      ┌───┴───┐   ┌──────┴───────┐      ┌──────┴────────┐               ┌──────┴──────┐
    │    │      │ Redis │   │ LLMProvider  │      │ MessageGateway │               │  MinIO/S3   │ (mídia)
    │    │      │Cluster│   │ port         │      │ port           │               └─────────────┘
    │    │      └───────┘   │ ├ openai      │      │ ├ go(whatsmeow) 1:1
    │    │                  │ ├ anthropic   │      │ └ cloud-api (broadcast/templates)
    │    │                  │ └ (gemini/…)  │
    │    └──────── Evolution GO (whatsmeow, N containers) ──publica AMQP──┘
    └───────────── Cloud API connector (Go) ◄─webhook─ Meta Cloud API ──┘
```

### 2.2 Tecnologias e justificativas

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Transporte/sessão/engine | **Go** | Goroutines (10k+ handlers/instância), footprint por sessão em outra ordem de grandeza, p99 previsível, binário estático p/ autoscaling, alinhado a Evolution GO/whatsmeow |
| Bus de eventos | **RabbitMQ** | Nativo nos dois gateways; buffer durável = resiliência (requisito nº1) |
| Control plane interno | **gRPC + protobuf** | Contrato tipado (NEXUS Event v1 → `.proto`), baixa latência, streaming p/ debug ao vivo |
| Painel/UI backend | **NestJS/TS** (existente) | UI forte já construída; browser não fala gRPC nativo → API pública fica REST/WS |
| Frontend | **Next.js/React** (existente) | Reskin macOS + tela de config do agente |
| Estado quente | **Redis Cluster** | Buffer/gate/cache-cfg/tail/dedup/rate-limit; particionável p/ 5M threads |
| Fonte de verdade | **Postgres particionado** | Histórico + config + campanhas; partição por tenant+tempo |
| Mídia | **MinIO/S3** | Nativo no GO; aposenta o proxy base64 do painel |
| IA | **Port `LLMProvider`** (OpenAI/Anthropic/…) | Provider e modelo por tenant; custo mínimo; sem lock-in |

### 2.3 Ambiente de implantação

**Híbrido/incremental.** Começa no **EasyPanel** (projeto `siteshkgroup`, onde já roda a produção). Conforme a escala real (validada em load test), migra os componentes quentes — **broker, Postgres, engine (autoscaling)** — para gerenciado/k8s. Evita big-bang de infra e mantém o custo baixo no início.

### 2.4 Padrões arquiteturais

- **Event-driven** (backbone): eventos de gateway → RabbitMQ → consumidores.
- **Hexagonal / ports-adapters**: `MessageGateway` (go|cloud-api) e `LLMProvider` (openai|anthropic|…) são ports; adicionar provedor/canal = novo adapter, sem tocar no núcleo.
- **gRPC** no control plane síncrono interno (painel↔engine).
- **CQRS-lite**: escrita canônica via eventos→Postgres; leitura por Redis (quente) + Postgres (frio/histórico).
- **REST/WebSocket** na borda pública (UI e webhooks).

---

## 3. Componentes e responsabilidades

| Componente | Papel | Persiste / Cacheia / Orquestra |
|---|---|---|
| **Frontend (Next.js)** | UI de controle + tela de config do agente | — |
| **Painel BFF (NestJS)** | UI/histórico/realtime/config CRUD/auth/admin; consumer de `nexus.panel.events` | Escreve Postgres; write-through Redis |
| **Engine (Go, N replicas)** | Buffer por conversa, gate de IA, agente (via `LLMProvider`), comandos admin, módulos por flag | **Stateless**; lê Redis; orquestra o fluxo de IA |
| **Evolution GO** | Sessões 1:1 (whatsmeow), publica AMQP, envia via REST GO | Sessões no Postgres próprio; mídia no S3 |
| **Cloud API connector (Go)** | Broadcast/templates oficiais; ingest webhook Meta; normaliza → NEXUS v1 | Stateless; status de entrega → Postgres |
| **RabbitMQ** | Bus durável, DLX/DLQ | Filas duráveis |
| **Redis Cluster** | Estado quente: buffer, gate, dedup, tail de histórico, cache de config, rate-limit | Cache/efêmero |
| **Postgres** | **Fonte de verdade**: tenants, users, config, mensagens (particionado), campanhas, auditoria | Persiste |
| **MinIO/S3** | Mídia | Persiste binários |

**Dependências externas:** Meta Cloud API, provedores LLM (OpenAI/Anthropic/…), servidor de licença Evolution GO (heartbeat tolerante a offline).

---

## 4. Fluxo de requisições e de dados

### 4.1 Inbound 1:1 (ponta a ponta)

WhatsApp → Evolution GO → AMQP → RabbitMQ (topic) →
- **(a)** `nexus.panel.events` → BFF consumer → **normalize (GO→NEXUS v1)** → **dedup** → Postgres (histórico) + Redis (tail) + **WS push** à UI.
- **(b)** `nexus.engine.events` → Engine → **resolve config (Redis)** → **gate de IA** (controle humano? self-chat?) → se IA ligada: buffer por conversa → **`LLMProvider` (provider/modelo do tenant)** → resposta → **envio via `MessageGateway`** (GO REST) → evento `SendMessage` → gravado como resposta da IA.

### 4.2 Inbound oficial (resposta de broadcast)

Meta webhook (assinado) → Cloud API connector → **normalize → NEXUS v1** → RabbitMQ → mesmo downstream.

### 4.3 Broadcast / campanha

UI → BFF → campaign service → enfileira jobs → Cloud API connector envia templates com **token-bucket por número** (respeita os tiers da Meta) → recibos (delivered/read) via webhook → status atualizado.

### 4.4 Pontos de validação/transformação/fila

- **Normalizer na borda** (contrato NEXUS v1) — Evolution GO e Cloud API convergem para o mesmo shape.
- **Dedup de boundary** (só `messages.upsert`/`send.message`; ACKs e idempotentes passam direto).
- **Assinatura do webhook Meta** verificada na entrada.
- **Gate de IA** na cabeça do engine (caminho único).

### 4.5 Persistência/replicação

Escrita canônica no **Postgres** (replica + failover); **Redis write-through** para config e tail; **mídia no S3**. `chathistory`: Redis guarda só a cauda (LTRIM ~200/conv), Postgres guarda o completo.

---

## 5. Modelo de dados (alto nível)

### 5.1 Entidades e relações

`Tenant` → `User` (RBAC) / `Channel` (gateway+transport+credenciais) / `Contact` → `Conversation` (thread: tenant+contact) → `Message` (**particionada por tenant+tempo**).
`TenantEngineConfig` (persona, flags de módulo, templates, `ownerJid`, `instanceId`, **`llmProvider`/`llmModel`/`llmBudgetCap`**, `cfg_version`).
`Template` (aprovado na Meta), `Campaign` → `CampaignRecipient`, `HumanControlState` (gate), `AuditLog`.

### 5.2 Fonte de verdade e sincronização/cache

**Postgres = fonte de verdade.** Write-through → Redis (`tenant:cfg:*`); o **engine lê só Redis**; reconcile no boot; `cfg_version` detecta drift. Chave canônica de `instancia` = nome atual do painel/registry (a GO entra como atributo `instanceId`, nunca como chave).

### 5.3 Versionamento e retenção

`NexusEventV1` versionado (tipos em `packages/shared`, espelhados no `.proto`). Migrations Drizzle — **conferir `journal`** (gotcha conhecido de ordem). Retenção por **drop de partição** (histórico antigo) + política **LGPD** (erasure/pseudonimização por tenant).

---

## 6. Interfaces públicas

| Interface | Protocolo / Formato | Escopo | SLA (proposto) |
|---|---|---|---|
| UI ↔ BFF | REST + **WebSocket** / JSON | Externa (autenticada) | ingest→UI p95 < 2s |
| Webhook Meta | HTTPS / JSON (assinado) | Externa entrante | — |
| Bus de eventos | **AMQP** / JSON (NEXUS v1) → protobuf (evolução) | Interna | fila sem consumo > N min = alerta |
| Control plane | **gRPC** / **protobuf** | Interna | RPC p95 < 100ms |
| Envio 1:1 | REST GO | Interna → gateway | — |
| Envio broadcast | Cloud API / templates | Externa (Meta) | dentro dos tiers Meta |

O **NEXUS Event v1** vira a fonte única de tipos (`.proto`, codegen Go). O browser não fala gRPC → a API pública permanece REST/WS.

---

## 7. Escalabilidade e disponibilidade

### 7.1 Números do alvo

500 tenants × ~10k conversas abertas ≈ **5M threads de estado**. Throughput: conversacional 1:1 (centenas/s) + picos de broadcast (milhares/s via Cloud API). **10k "chats abertos" é estado de conversa (contatos), não carga concorrente** — sessões WhatsApp (~1 número/tenant) não são o gargalo.

### 7.2 Estratégias

- **Scaling horizontal:** engine stateless → N réplicas em *competing consumers* (prefetch 10–20); Evolution GO → N containers pequenos shardando tenants (blast radius menor); Cloud API connector → N réplicas.
- **Particionamento/sharding:** Postgres particionado por tenant+tempo (avaliar Citus se saturar); **Redis Cluster**; quorum queues no RabbitMQ.
- **Caching:** write-through de config + tail de histórico no Redis.
- **Rate limiting / backpressure:** limite por tenant; prefetch + DLQ; **token-bucket por número** no broadcast (evita ban / respeita Meta); campaign scheduler.
- **Disponibilidade:** RabbitMQ quorum/HA; Postgres replica+failover; Redis Cluster/Sentinel; réplicas stateless; DLQ+replay; **watchdog de vivacidade → alerta no WhatsApp do dono**. SLOs a definir (uptime atendimento, latência ingest→UI, sucesso de envio).

---

## 8. Segurança

- **AuthN:** usuários do painel (JWT/sessão, existente); **assinatura do webhook Meta** verificada; API keys por instância GO.
- **AuthZ:** RBAC (superadmin/admin/agent — modelo existe); **tenant scoping em toda query**.
- **Segredos:** secrets do EasyPanel/vault; **API keys de LLM e gateway por tenant criptografadas em repouso**.
- **Cripto:** TLS em trânsito; disco criptografado em repouso; mídia via **signed URLs**.
- **PII/LGPD:** namespacing por tenant (`chat:<inst>:`, `tenant:cfg:<inst>`); minimização; **pseudonimização** para analytics; retenção + direito ao esquecimento; audit log. *(LGPD/escala pendente — ver riscos.)*

---

## 9. Observabilidade

- **Logs estruturados** (JSON): `tenant/instancia/event/gateway/trace-id/cfg_version`.
- **Métricas-chave:** profundidade por fila, taxa de consumo, `dedup-hit`, DLQ, **latência e custo de IA por tenant/provider/modelo**, taxa de sucesso de envio, saúde de sessão, uso de tier Cloud API.
- **Tracing distribuído:** OpenTelemetry, `trace-id` propagado via headers AMQP + metadata gRPC (BFF↔engine↔gateway).
- **Dashboards/alertas:** broker fora / fila sem consumo (watchdog→WhatsApp), DLQ>0, **spike de custo de IA / budget cap atingido**, desconexão de sessão, throttle Meta.
- **SLOs/SLA:** ingest→UI, resposta IA, sucesso de envio, uptime.

---

## 10. Camada de IA — provider-agnóstica e custo mínimo

**Custo mínimo é requisito de primeira classe** (dev solo, margem apertada em escala).

### 10.1 Port `LLMProvider`

Interface única; adapters `openai`, `anthropic` (e a mesma interface serve `gemini`/`groq`/open-source). **Provider e modelo por tenant** (`TenantEngineConfig`). Trocar de provedor = flip de config, não reescrita.

### 10.2 Ressalva honesta sobre "gratuito"

A **API da OpenAI não tem tier gratuito de produção** (o grátis é o ChatGPT web). O mais barato via API é a classe `gpt-4o-mini`. Se o objetivo é começar **sem custo real**, o port permite plugar **Google Gemini Flash** ou **Groq (Llama)**, que oferecem free tier de API. Caminho recomendado: começar no mais barato que atenda (Gemini Flash grátis **ou** `gpt-4o-mini`) → evoluir para Claude quando a margem permitir. Preço/modelo exatos são **validados na implementação** (variam) e viram config.

### 10.3 Alavancas de custo

| Alavanca | Efeito |
|---|---|
| **Gate humano** (existe) | Só conversa com IA ligada chama LLM — limita volume na raiz |
| **Prompt caching** (OpenAI e Anthropic suportam) | Persona/system prompt repetido fica barato |
| **Model tiering** | Modelo barato no rotineiro; escala p/ forte só quando necessário |
| **Buffer por conversa** (no desenho) | Agrupa mensagens → menos chamadas |
| **Budget cap por tenant** | Teto de gasto de IA por cliente; corta ao atingir |
| **Memória resumida** (não histórico cru) | Menos tokens por chamada |

---

## 11. Riscos arquiteturais e mitigação

| Risco | Prob. | Impacto | Mitigação | Contingência |
|---|---|---|---|---|
| **Go p/ orquestração LLM** (SDK menos maduro) | Média | Médio | Chamar APIs LLM via REST direto; port fino; portar do N8N incremental | Módulo de IA isolável p/ trocar runtime |
| **Ban WhatsApp não-oficial** (mesmo 1:1) | Média | Alto | Taxas conservadoras, warmup, monitor de ban; broadcast só no oficial | Migrar conversas p/ Cloud API |
| **Custo/aprovação de templates Cloud API** | Alta | Médio | Biblioteca de templates; dashboard de custo/tenant; repasse | — |
| **5M threads (estado)** | Alta | Alto | **Tiering Redis (roadmap #1) obrigatório**; partição Postgres; load test | Sharding/Citus |
| **RabbitMQ SPOF** | Baixa | Alto | Quorum queues/HA; fallback webhook nos dois gateways | Restaurar + drenar |
| **Dev solo operando Go + distribuído** | Alta | Médio | 3–4 serviços graúdos; runbooks; IaC; rollout faseado | — |
| **Custo de LLM domina margem** | Média | Alto | Gate humano + budget cap por tenant + model tiering + provider barato | Downgrade de modelo/provider |
| **Cutover/migração** | Média | Alto | Fases §7.1/§7.2 da spec RabbitMQ (re-pareamento, fila viva) | Rollback por tenant |
| **Evolution GO pré-1.0** (paridade features) | Média | Alto | Gate duro da Fase 0 com número de teste (spec RabbitMQ §7) | Plano B: producer Node |

---

## 12. ADRs associados e próximos passos

### 12.1 Já registrados (specs/decisões)

- RabbitMQ + Evolution GO — `docs/superpowers/specs/2026-07-17-desacoplamento-rabbitmq-design.md` (v3 aprovada).
- Realtime latency — `2026-06-19-realtime-latency-architecture-design.md`.
- Vínculo tenant↔instância↔n8n — `2026-07-01-vinculo-tenant-instancia-n8n-design.md`.
- WhatsApp parity — `2026-07-02-whatsapp-parity-chat-ux-plan.md`.

### 12.2 Decisões pendentes (viram ADR) e critério de tomada

| Decisão | Critério |
|---|---|
| Engine em **Go** (confirmada) | Escrever ADR formal |
| Introdução do **Cloud API connector** | Novo ADR; sandbox Meta na Fase 0 |
| **Provider LLM inicial** (Gemini Flash grátis vs `gpt-4o-mini`) | Custo/qualidade no piloto |
| **Redis Cluster vs Sentinel** | Load test do estado quente |
| **Partição Postgres** (nativa vs Citus) | Volume real de histórico |
| **Protobuf como wire do bus** vs JSON | Ganho medido vs esforço |
| **Alvo de implantação** (EasyPanel vs k8s) | Escala real |

### 12.3 Próximos passos técnicos até o FDD/LLD

1. **Aprovar este HLD** (feito no brainstorming).
2. Escrever os **ADRs** das decisões novas (Go engine, Cloud API connector, provider LLM, protobuf wire).
3. **Fase 0 / spike:** captura de payload real Evolution GO + sandbox Cloud API + esqueleto do engine Go + contrato `.proto` do NEXUS v1 + PoC do port `LLMProvider` com adapter barato. (Fixtures douradas do normalizer dependem de payload CAPTURADO, não assumido.)
4. **writing-plans** → plano de implementação faseado, reaproveitando §7.1/§7.2 da spec RabbitMQ.

---

## Referências

- Spec base: `docs/superpowers/specs/2026-07-17-desacoplamento-rabbitmq-design.md`
- Evolution GO: https://github.com/evolution-foundation/evolution-go
- Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
