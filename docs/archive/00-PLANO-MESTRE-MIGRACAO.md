# NEXUS Platform — Plano Mestre de Migracao para Node.js

## Visao Geral

Migracao do NEXUS Painel de Java Spring Boot para **NestJS (TypeScript)**, unificando
backend e frontend em uma unica linguagem. O objetivo e criar uma plataforma de automacao
WhatsApp com qualidade visual e tecnica de produto premium (referencia: Linear, Vercel, Stripe).

---

## System Design

```
                        ┌─────────────────────────┐
                        │     Caddy (TLS/Proxy)   │
                        │   api.shkgroups.com      │
                        │   app.shkgroups.com      │
                        └──────┬──────────┬───────┘
                               │          │
                    ┌──────────▼──┐  ┌────▼────────────┐
                    │  Next.js    │  │  NestJS BFF      │
                    │  (Frontend) │  │  (Backend API)   │
                    │  Port 3000  │  │  Port 4000       │
                    └─────────────┘  └──┬───┬───┬──────┘
                                        │   │   │
              ┌─────────────────────────┘   │   └─────────────────┐
              │                             │                     │
     ┌────────▼────────┐          ┌─────────▼──────┐    ┌────────▼────────┐
     │  Redis 7        │          │  Evolution API │    │  Google Sheets  │
     │  (State + PubSub│          │  (WhatsApp)    │    │  (CRM temp)     │
     │   + Streams)    │          └────────────────┘    └─────────────────┘
     └─────────────────┘                   │
              │                   ┌────────▼────────┐
              │                   │  N8N            │
              └───────────────────│  (AI Agent)     │
                                  │  INTOCAVEL      │
                                  └─────────────────┘
```

### Principio #1: N8N e INTOCAVEL
O N8N continua sendo o cerebro do agente IA. O painel e camada de visualizacao e controle.
Nenhuma mudanca no N8N. O BFF le/escreve nas mesmas chaves Redis que o N8N ja usa.

### Principio #2: TypeScript Full-Stack
Uma linguagem. Um ecossistema. Tipos compartilhados entre backend e frontend via monorepo.

### Principio #3: Design como Diferencial
Nao e um painel admin. E um produto premium que justifica o preco da SHK GROUP.IA.

---

## Arquitetura de Modulos (NestJS)

```
@nexus/api (NestJS Application)
│
├── core/                          # Infraestrutura transversal
│   ├── auth/                      # JWT + Magic Link + Guards
│   ├── tenant/                    # Multi-tenancy (decorator + interceptor)
│   ├── redis/                     # Conexao, helpers, keyspace listener
│   ├── resilience/                # Circuit breaker, retry, rate limit
│   ├── logger/                    # Structured logging (pino)
│   └── health/                    # Health checks customizados
│
├── webhook/                       # Recebe eventos da Evolution API
│   ├── webhook.controller.ts
│   └── webhook.service.ts
│
├── conversation/                  # Conversas do WhatsApp
│   ├── conversation.controller.ts
│   ├── conversation.service.ts
│   ├── conversation.repository.ts # Redis operations
│   └── dto/
│
├── ai-control/                    # Toggle IA ON/OFF
│   ├── ai-control.controller.ts
│   ├── ai-control.service.ts
│   └── dto/
│
├── dashboard/                     # KPIs e metricas
│   ├── dashboard.controller.ts
│   └── dashboard.service.ts
│
├── lead/                          # CRM (Google Sheets)
│   ├── lead.controller.ts
│   ├── lead.service.ts
│   └── sheets.client.ts
│
├── whatsapp/                      # Integracao Evolution API
│   ├── whatsapp.controller.ts
│   ├── whatsapp.service.ts
│   └── evolution.client.ts
│
├── realtime/                      # WebSocket Gateway
│   ├── events.gateway.ts          # Socket.IO gateway
│   ├── keyspace.listener.ts       # Redis keyspace → eventos
│   ├── event.translator.ts        # Keyspace → NexusEvent
│   └── stream-replay.service.ts   # Replay no reconnect
│
├── admin/                         # Gestao de tenants
│   ├── admin.controller.ts
│   └── tenant.service.ts
│
└── shared/                        # Tipos compartilhados
    ├── types/                     # Interfaces e enums
    │   ├── nexus-event.ts
    │   ├── conversation.ts
    │   ├── funnel-stage.ts
    │   └── ai-control-state.ts
    ├── dto/                       # DTOs compartilhados
    └── utils/                     # Phone mask, idempotency, etc.
```

---

## Stack Tecnica Completa

### Backend (NestJS)

| Camada           | Tecnologia                      | Substitui (Spring)                |
|------------------|---------------------------------|-----------------------------------|
| Framework        | NestJS 10                       | Spring Boot 3.3                   |
| Runtime          | Node.js 20 LTS                  | Java 17 (JVM)                     |
| Linguagem        | TypeScript 5.5                  | Java 17                           |
| HTTP Server      | Fastify (adapter)               | Tomcat                            |
| WebSocket        | Socket.IO (via @nestjs/websocket)| STOMP over SockJS                |
| Redis            | ioredis                         | Spring Data Redis (Lettuce)       |
| Auth             | @nestjs/passport + jose (JWT)   | Spring Security + jjwt            |
| Validacao        | class-validator + class-transformer | Bean Validation              |
| HTTP Client      | undici / node-fetch             | WebClient (WebFlux)               |
| Resiliencia      | cockatiel                       | Resilience4j                      |
| Cache            | @nestjs/cache-manager + node-cache | Caffeine                       |
| Google Sheets    | googleapis                      | google-api-services-sheets        |
| Email            | resend (SDK oficial)            | HTTP client manual                |
| Logging          | nestjs-pino (pino)              | Logback + SLF4J                   |
| Metricas         | prom-client                     | Micrometer                        |
| Docs API         | @nestjs/swagger                 | SpringDoc OpenAPI                 |
| Testes           | Vitest + Supertest              | JUnit 5 + Testcontainers          |
| Monorepo         | pnpm workspaces                 | N/A                               |

### Frontend (Next.js — Redesign Premium)

| Camada           | Tecnologia                      | Mudanca vs atual                  |
|------------------|---------------------------------|-----------------------------------|
| Framework        | Next.js 15 (App Router)         | Upgrade de 14.2                   |
| UI Primitives    | Radix UI                        | Substitui shadcn parcialmente     |
| Styling          | Tailwind CSS 4 + CSS Variables  | Upgrade de 3.4                    |
| Animacoes        | Framer Motion 11                | Mantido                           |
| State            | Zustand 5                       | Upgrade de 4                      |
| Server State     | TanStack Query v5               | Mantido                           |
| WebSocket        | Socket.IO Client 4              | Substitui STOMP/SockJS            |
| Flow Builder     | React Flow / XYFlow             | NOVO                              |
| Charts           | Tremor + Recharts               | Adiciona Tremor                   |
| Tabelas          | TanStack Table v8               | NOVO                              |
| Forms            | React Hook Form + Zod           | Mantido                           |
| Icons            | Lucide React                    | Mantido                           |

---

## Fases de Implantacao

### Fase 1 — BFF NestJS (`fase-1-bff-node/`)
Migracao 1:1 do backend Spring Boot para NestJS. Mesmas funcionalidades,
mesmos contratos REST, mesmas chaves Redis. Zero mudanca no N8N.

**Entregaveis:**
- Projeto NestJS com todos os modulos
- Testes unitarios e de integracao
- Mesmos endpoints e DTOs do Spring Boot
- WebSocket via Socket.IO (substitui STOMP)
- Documentacao Swagger

**Criterio de done:** Todos os endpoints respondem identico ao Spring Boot.
Frontend existente funciona sem mudanca (exceto WebSocket client).

### Fase 2 — Frontend V2 (`fase-2-frontend-v2/`)
Redesign completo do frontend com identidade visual premium.
Dark-first. Animacoes cinematograficas. Flow builder.

**Entregaveis:**
- Design system (tokens, cores, tipografia)
- Componentes Radix + Tailwind
- Paginas redesenhadas
- Flow builder visual
- Inbox realtime premium
- PWA com push notifications

**Criterio de done:** Todas as paginas implementadas, dark mode,
responsivo, animacoes funcionais, score Lighthouse > 90.

### Fase 3 — Infra e Deploy (`fase-3-infra-deploy/`)
Atualizacao da infra para o runtime Node.js.

**Entregaveis:**
- Dockerfile otimizado (multi-stage, ~80MB)
- docker-compose atualizado
- Caddyfile atualizado
- Scripts de deploy
- Prometheus + metricas prom-client
- Health checks

**Criterio de done:** Deploy automatizado, health checks passando,
metricas expostas, alertas Telegram funcionando.

### Fase 4 — Cutover (`fase-4-migracao-cutover/`)
Migracao de producao com zero downtime.

**Entregaveis:**
- Checklist pre-migracao
- Plano de rollback
- Validacao pos-migracao
- Descomissionamento do Spring Boot

**Criterio de done:** Producao rodando em Node.js, Spring Boot desligado,
N8N funcionando normalmente, zero perda de dados.

---

## Dependencias entre Fases

```
Fase 1 (BFF NestJS) ──────► Fase 3 (Infra)
       │                          │
       │                          ▼
       │                     Fase 4 (Cutover)
       │                          ▲
       ▼                          │
Fase 2 (Frontend V2) ─────────────┘
```

- Fase 1 e 2 podem ser desenvolvidas **em paralelo** (frontend usa mocks)
- Fase 3 depende de Fase 1 estar pronta (precisa do Dockerfile final)
- Fase 4 depende de Fase 1, 2 e 3 estarem prontas

---

## Estrutura de Arquivos deste Plano

```
nexus-build/
├── 00-PLANO-MESTRE-MIGRACAO.md        ← VOCE ESTA AQUI
│
├── fase-1-bff-node/
│   ├── 01-arquitetura-modulos.md      # Modulos NestJS, DI, providers
│   ├── 02-auth-tenancy.md             # JWT, Magic Link, Guards, Multi-tenant
│   ├── 03-redis-realtime.md           # Redis, Keyspace, Socket.IO, Streams
│   ├── 04-services-controllers.md     # Todos os endpoints 1:1
│   ├── 05-resiliencia-clients.md      # Circuit breaker, retry, Evolution, Sheets
│   ├── 06-testes.md                   # Vitest, Supertest, mocks
│   └── 07-tipos-compartilhados.md     # Shared types (monorepo)
│
├── fase-2-frontend-v2/
│   ├── 01-design-system.md            # Tokens, cores, tipografia, dark mode
│   ├── 02-componentes-ui.md           # Componentes base, variants, estados
│   ├── 03-paginas-layouts.md          # Cada pagina com wireframe e specs
│   ├── 04-realtime-socketio.md        # Socket.IO client, reconexao, replay
│   ├── 05-flow-builder.md             # React Flow, nos customizados
│   ├── 06-animacoes-microinteracoes.md# Framer Motion, transicoes, efeitos
│   └── 07-pwa-mobile.md              # PWA, responsivo, push notifications
│
├── fase-3-infra-deploy/
│   ├── 01-dockerfile-node.md          # Multi-stage build Node.js
│   ├── 02-docker-compose.md           # Orquestracao atualizada
│   ├── 03-caddy-deploy.md             # Reverse proxy, scripts
│   └── 04-observabilidade.md          # Pino, prom-client, Prometheus, alertas
│
├── fase-4-migracao-cutover/
│   ├── 01-checklist-pre-migracao.md   # Tudo que validar antes
│   ├── 02-plano-cutover.md            # Passo a passo do dia D
│   └── 03-rollback-validacao.md       # Plano B + validacao pos
│
├── fase-1-bff/                        # [LEGADO] Docs do Spring Boot original
├── fase-2-frontend/                   # [LEGADO] Docs + codigo frontend v1
└── fase-3-infra-obs/                  # [LEGADO] Docs infra Spring Boot
```

---

## Chaves Redis — Contrato Imutavel

As chaves Redis sao o contrato entre N8N e o BFF. Nao mudam na migracao.
Referencia completa em `fase-1-bff/01-contexto-negocio.md`.

**Resumo:**
```
chat:{inst}:{jid}:humanControlUntil   # Controle IA ON/OFF
chat:{inst}:{jid}:paymentStatus       # Status pagamento
chat:{inst}:{jid}:followup_step       # Posicao funil S0-S6
chat:{inst}:{jid}:notas               # Notas internas
chat:{inst}:{jid}:tags                # Tags/etiquetas
chat:{inst}:{jid}:buffer              # Buffer debounce (N8N)
chat:{inst}:{jid}:processing          # Lock processamento (N8N)
chathistory:{inst}-{jid}              # Historico LangChain
events:{inst}                         # Stream de eventos (BFF)
tenant:registry                       # Registry multi-tenant
```

---

## Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| N8N para de funcionar durante migracao | CRITICO | BFF novo le mesmas chaves Redis. N8N nao e tocado. |
| Webhook Evolution sobrescrito | CRITICO | Codigo novo NAO tem setWebhook. URL do N8N preservada. |
| Perda de dados Redis | ALTO | Backup Redis antes do cutover. BFF novo e read-compatible. |
| Frontend quebra com Socket.IO | MEDIO | Socket.IO e backward-compatible. Testes E2E validam. |
| Performance Node vs JVM | BAIXO | Node e mais rapido para I/O-bound. BFF e 100% I/O. |
| Google Sheets rate limit | MEDIO | Mantido mesmo rate limiter. Futuramente migra pra Postgres. |
