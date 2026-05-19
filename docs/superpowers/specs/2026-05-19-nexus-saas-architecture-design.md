# NEXUS SaaS Architecture Design

**Date:** 2026-05-19
**Status:** Draft
**Author:** Rafa (SHK GROUP.IA) + Claude

## 1. Problem Statement

A SHK GROUP.IA possui um fluxo N8N (NEXUS V6.0) que funciona como agente IA de vendas via WhatsApp, e um painel web (NEXUS Painel) que da visibilidade ao que o agente faz. Hoje ambos rodam para uso interno. O objetivo e transformar esse conjunto em um produto SaaS vendavel para donos de negocio que querem automatizar atendimento WhatsApp sem saber nada de tecnologia.

## 2. Decisions

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Modelo de venda | SaaS multi-tenant | Recorrencia mensal, controle centralizado |
| Publico-alvo | Donos de negocio (leigos) | Zero config tecnica, tudo gerenciado |
| Onboarding | Semi-automatico | Cliente faz cadastro/pagamento/QR; SHK configura N8N e prompt |
| Personalizacao IA | Consultiva pela SHK | SHK cria prototipos, cliente testa 48h, refinamento iterativo |
| Isolamento N8N | Uma instancia N8N por cliente | Isolamento total de fluxo, credentials e prompt |
| Infra | EasyPanel (ja em uso) | SSL auto, domains por app, logs centralizados |

## 3. Architecture Overview

### 3.1 Topology

```
EasyPanel (VPS)
+-- Apps compartilhados (1x)
|   +-- nexus-api          (NestJS - BFF multi-tenant)
|   +-- nexus-web          (Next.js - painel do cliente)
|   +-- redis              (Redis 7 - estado compartilhado, namespaced por instancia)
|   +-- evolution-api      (Evolution API - compartilhada, multiplas instancias WhatsApp)
|
+-- Apps por cliente
|   +-- n8n-clienteA       (N8N dedicado - fluxo V6.0 personalizado)
|   +-- n8n-clienteB       (N8N dedicado - fluxo V6.0 personalizado)
|   +-- n8n-clienteC       ...
|
+-- Dominios
    +-- painel.shkgroups.com     -> nexus-web
    +-- api.shkgroups.com        -> nexus-api
    +-- {cliente}.n8n.shkgroups.com -> n8n do cliente (acesso SHK only)
```

### 3.2 Principios

1. **N8N isolado por cliente** - cada um tem sua instancia Docker com fluxo personalizado
2. **Redis compartilhado** - funciona por namespace `chat:{instancia}:{jid}:*` (padrao do V6.0)
3. **Painel compartilhado** - um deploy NestJS + Next.js atende todos os tenants
4. **Evolution API compartilhada** - instancias WhatsApp diferentes no mesmo Evolution
5. **O cliente nunca ve N8N, Redis ou config tecnica** - so ve o painel

### 3.3 Data Flow: N8N -> Redis -> Painel

```
FLUXO N8N V6.0                     REDIS                          PAINEL
--------------                     -----                          ------

Msg chega no webhook ------> SET chat:{inst}:{jid}:buffer ----> Socket.IO push
                                                                 Conversa atualiza real-time

IA responde ----------> SET chat:{inst}:{jid}:temp ---------> Nova mensagem no chat
                        (LangChain memory)

Funil avanca ----------> SET chat:{inst}:{jid}:state -------> Card move no Kanban

Humano assume ---------> SET chat:{inst}:{jid}:             -> Badge muda para "Humano"
                         humanControlUntil

Pagamento aprovado ----> SET chat:{inst}:{jid}:             -> KPI "Receita" atualiza
                         paymentStatus = "paid"

Alerta critico --------> SET chat:{inst}:{jid}:tags --------> Notificacao no painel
```

O painel le Redis por namespace - nao importa qual instancia N8N escreveu.
O decorator `@Tenant()` na API garante isolamento por instancia no JWT.

## 4. N8N Flow (V6.0) - Capabilities Map

O fluxo NEXUS V6.0 implementa:

### Entry Points
- **Webhook Evolution API** (`/shkgroupwpp`) - mensagens WhatsApp
- **Webhook MercadoPago** (`/mp-notify`) - notificacoes de pagamento

### Processing Pipelines
- **Texto**: Normalizacao -> Buffer Redis -> Deduplicacao (lock) -> AI Agent (GPT-4.1-mini)
- **Audio**: Evolution API download -> Groq Whisper transcricao -> texto pipeline
- **Imagem**: Evolution API download -> Groq Llama analise -> texto pipeline

### AI Agent
- Modelo: GPT-4.1-mini via OpenAI
- Memoria: Redis Chat Memory (LangChain, 12 msgs contexto)
- Persona: NEXUS - agente de vendas SHK
- Funil: S0 (boas-vindas) -> S7 (checkout)

### Integrations
- **MercadoPago**: Criar preference, processar webhook, confirmar pagamento
- **Google Sheets**: CRM de leads (upsert)
- **Google Contacts**: Criar contato automaticamente
- **Google Drive**: Videos de demonstracao
- **Evolution API**: Mensagens, presence, media, read receipts

### Control Systems
- **Human Control**: SET/GET `humanControlUntil` (30min padrao)
- **Admin Commands**: ON/OFF, status, reset, notas, msg, help (12 comandos)
- **Deduplication**: Redis lock NX com TTL 15s
- **Message Buffer**: Lista Redis com montagem apos delay

### Modules
- **Notas**: Adicionar/listar notas por conversa (Redis + Sheets)
- **Tags**: Categorizar leads dinamicamente (Redis + Sheets)
- **Alertas**: Detectar palavras criticas (cancelar, raiva, processo) -> notificar admin

### Redis Key Structure
| Key Pattern | Proposito | TTL |
|------------|-----------|-----|
| `chat:{inst}:{jid}:buffer` | Buffer de mensagens | Deletado apos uso |
| `chat:{inst}:{jid}:temp` | Memoria LangChain | N/A |
| `chat:{inst}:{jid}:state` | Estado do chat | N/A |
| `chat:{inst}:{jid}:processing` | Lock deduplicacao | 15s |
| `chat:{inst}:{jid}:humanControlUntil` | Takeover humano | 1 ano |
| `chat:{inst}:{jid}:paymentStatus` | Flag pagamento | 30 dias |
| `chat:{inst}:{jid}:tags` | Tags do lead | N/A |
| `chat:{inst}:{jid}:contactSaved` | Google Contact ref | 7 dias |
| `mp:payment:{id}:approvedSent` | Dedup confirmacao | 7 dias |
| `mp:extref:{ref}` | Contexto pagamento MP | N/A |

## 5. Existing Codebase (What Already Works)

### API (apps/api) - NestJS
- **Auth**: JWT + magic link (Resend), `@Tenant()` decorator, `JwtAuthGuard`, `RolesGuard`
- **Conversations**: CRUD completo (list, detail, messages, notes, tags, send, stage, hot toggle)
- **AI Control**: GET status, POST toggle ON/OFF/OFF_UNTIL
- **Dashboard**: KPIs agregados por tenant
- **Leads**: Service + controller
- **Quick Replies**: CRUD
- **Reminders**: CRUD + scheduler
- **Realtime**: Socket.IO gateway, event publisher, stream replay
- **Admin**: TenantService (register, toggle, add/remove user) - guarded by `@Roles('admin')`
- **Webhook**: Module exists
- **Health**: Redis + Evolution API health checks
- **Metrics**: Service + controller

### Web (apps/web) - Next.js 14
- **Dashboard**: KPIs (leads, receita, conversao, tempo resposta), FunnelChart, SalesTable, ActivityList
- **Conversas**: Sidebar com filtros (IA Ativa/Humano/Hot), chat com message bubbles, input, header
- **Kanban**: Board + cards por stage
- **Feed**: Timeline de atividades
- **Login**: Magic link
- **Connect**: QR code scan
- **UI**: Dark theme glassmorphism, Framer Motion, Three.js particles (login)

### Current Type Definitions (packages/shared)
```typescript
// Current state - these will be extended
interface TenantUser {
  email: string;
  role: 'admin' | 'operator';
}

interface TenantEntry {
  instancia: string;
  name: string;
  users: TenantUser[];
  createdAt: string;
  active: boolean;
  connectionState?: 'created' | 'open' | 'close' | 'connecting';
  syncStatus?: 'pending' | 'syncing' | 'done' | 'error';
  connectedAt?: string;
  n8nWebhookUrl?: string;
}
```

## 6. Schema Changes Required

### 6.1 TenantUser - Add `superadmin` role

```typescript
interface TenantUser {
  email: string;
  role: 'superadmin' | 'admin' | 'operator';
}
```

**Migration path:**
- Add `'superadmin'` to the role union type
- `RolesGuard` already checks `role` from JWT — no guard changes needed, just the type
- Existing `@Roles('admin')` on `AdminController` continues to work (admin can manage their own tenant)
- New cross-tenant endpoints use `@Roles('superadmin')` (only SHK team)
- `superadmin` is seeded manually in Redis for Rafa's email — never exposed in signup flow
- `superadmin` bypasses tenant scoping: can list all tenants and access any tenant's data

### 6.2 TenantEntry - Add plan, status, subscription fields

```typescript
type TenantStatus = 'pending_setup' | 'trial' | 'active' | 'suspended' | 'cancelled';
type PlanTier = 'start' | 'pro' | 'obsidian';

interface TenantEntry {
  instancia: string;
  name: string;
  users: TenantUser[];
  createdAt: string;
  active: boolean; // kept for backwards compat, derived from status

  // New fields for SaaS
  status: TenantStatus;
  plan: PlanTier;
  subscription?: {
    mpPreapprovalId?: string;   // MercadoPago subscription ID
    currentPeriodEnd?: string;  // ISO date
    paymentMethod?: string;
  };
  onboarding: {
    n8nReady: boolean;
    evolutionReady: boolean;
    whatsappConnected: boolean;
    promptApproved: boolean;
  };

  // Existing fields
  connectionState?: 'created' | 'open' | 'close' | 'connecting';
  syncStatus?: 'pending' | 'syncing' | 'done' | 'error';
  connectedAt?: string;
  n8nWebhookUrl?: string;
}
```

### 6.3 Tenant Status State Machine

```
                 MP payment approved
[new customer] ──────────────────────> [pending_setup]
                                            │
                                  SHK completes setup
                                            │
                                            v
                                        [trial]
                                            │
                                   48h test period ends
                                   SHK marks go-live
                                            │
                                            v
                                        [active]
                                       /        \
                          payment fails/          \subscription renewed
                          admin suspends           \(auto, stays active)
                                /
                               v
                         [suspended]
                          /        \
              pays again/          \30 days no payment
                       /            \or admin cancels
                      v              v
                  [active]      [cancelled]
```

**Transition rules:**
| From | To | Trigger |
|------|-----|---------|
| (new) | `pending_setup` | MercadoPago subscription webhook `authorized` |
| `pending_setup` | `trial` | Admin marks all 4 onboarding steps as done |
| `trial` | `active` | Admin marks go-live (after 48h test) |
| `active` | `suspended` | Payment failure OR admin manual suspend |
| `suspended` | `active` | Payment succeeds OR admin reactivates |
| `suspended` | `cancelled` | 30 days without payment OR admin cancels |
| `active` | `cancelled` | Admin cancels |

**`active` field derivation:** `active = ['trial', 'active'].includes(status)`
This maintains backwards compat with existing code that checks `tenant.active`.

## 7. What Needs to Be Built (MVP for Sales)

### P0 - Essencial para vender

#### 7.1 Admin Dashboard SHK (interno)
Tela acessivel apenas por `superadmin` para gerenciar todos os tenants cross-tenant.

**Funcionalidades:**
- Lista de tenants com status, plano, e onboarding progress
- Criar novo tenant (instancia, admin email, plano)
- Onboarding checklist por tenant (4 toggles: N8N, Evolution, WhatsApp, Prompt)
- Ativar/desativar/cancelar tenant
- Metricas globais (total leads, total receita, tenants ativos)

**Implementacao:**
- Backend: Novo `SuperAdminController` com `@Roles('superadmin')` — separado do `AdminController` existente (que continua servindo admins de tenant)
- Frontend: Nova rota `/superadmin` com guard de role no middleware Next.js
- O `AdminController` existente (`@Roles('admin')`) nao muda

#### 7.2 Tela "Meu Plano" (cliente)
Pagina simples mostrando plano atual e opcao de upgrade.

**Funcionalidades:**
- Nome do plano, preco, data de renovacao (de `tenant.subscription.currentPeriodEnd`)
- Features incluidas no plano
- Botao de upgrade (redireciona para pagamento MP)
- Status da assinatura (derivado de `tenant.status`)

**Implementacao:**
- Backend: Endpoint `GET /subscription` que retorna `{ plan, status, subscription }` do tenant
- Frontend: Nova rota `/settings/plan`

#### 7.3 Tela "Relatorios" (cliente)
Graficos de performance do agente IA.

**Funcionalidades:**
- Leads por dia/semana (grafico de barras)
- Conversoes por periodo (linha)
- Receita acumulada (area)
- Taxa de conversao do funil S0->S7 (sankey)
- Filtro por periodo (7d, 30d, 90d)

**Fonte de dados:**
- Dados de conversas/leads: Google Sheets (CRM atual do fluxo V6.0, cada cliente tem sua sheet)
- Dados de pagamento: Redis `paymentStatus` keys (TTL 30d — suficiente para MVP)
- Dados de funil: Redis `state` keys (sem TTL)

**Limitacao conhecida:** Relatorios historicos alem de 30 dias nao estarao disponiveis para metricas de pagamento ate migrar para Postgres. Para MVP isso e aceitavel — o cliente mais se importa com os ultimos 7-30 dias.

**Plan-gated:** START ve apenas 7 dias, PRO ve 30 dias, OBSIDIAN ve 90 dias.

**Implementacao:**
- Backend: Endpoint `GET /reports?period=7d|30d|90d` com agregacao Redis + Sheets
- Frontend: Nova rota `/reports` com Recharts

#### 7.4 Subscription Webhook (MercadoPago)
Endpoint que processa assinaturas recorrentes via MercadoPago Subscriptions (Preapproval).

**Fluxo MercadoPago Subscriptions:**
1. Landing page cria `preapproval` via MercadoPago Subscriptions API
2. Cliente paga, MP redireciona para painel
3. MP envia webhook com status updates

**Webhook events processados:**
- `preapproval.authorized` -> Criar tenant com `status: pending_setup`
- `preapproval.paused` -> Mudar status para `suspended`
- `preapproval.cancelled` -> Mudar status para `cancelled`
- `authorized_payment.created` (status=approved) -> Atualizar `subscription.currentPeriodEnd`

**Mapeamento plano -> preapproval:**
O `external_reference` do preapproval contem o tier: `start|pro|obsidian:{email}`

**Seguranca do webhook:**
- Validar assinatura HMAC do MercadoPago (header `x-signature`)
- Buscar o recurso na API MP para confirmar (nao confiar apenas no body do webhook)
- Idempotency: verificar `preapproval.id` contra `tenant.subscription.mpPreapprovalId` antes de criar duplicata
- Rate limit: 10 req/min no endpoint via `ThrottleGuard` existente

**Implementacao:**
- Backend: `POST /webhooks/subscription` no webhook module (publico, sem JWT)
- Ao criar tenant: envia notificacao WhatsApp para admin SHK via Evolution API
- Se tenant ja existe (reativacao): atualiza status para `pending_setup`

#### 7.5 Plan Enforcement
Guard de plano na API que limita features por tier.

**Enforcement completo:**

| Feature | Enforcement point | START | PRO | OBSIDIAN |
|---------|------------------|-------|-----|----------|
| Quick replies | `QuickRepliesService.create()` — count check | max 5 | max 20 | unlimited |
| Reminders | `@PlanRequired('pro')` on controller | blocked | allowed | allowed |
| Alertas email | `@PlanRequired('pro')` on alerts endpoint | blocked | allowed | allowed |
| Alertas WhatsApp | `@PlanRequired('obsidian')` on alerts config | blocked | blocked | allowed |
| Relatorios periodo | `ReportsService.getData()` — period cap | 7d max | 30d max | 90d max |
| Canais WhatsApp | Checked at provisioning (manual) | 1 | 2 | unlimited |

**HTTP response quando bloqueado:** `403 Forbidden` com body:
```json
{
  "statusCode": 403,
  "error": "PlanRequired",
  "message": "Este recurso requer o plano PRO ou superior",
  "requiredPlan": "pro",
  "currentPlan": "start",
  "upgradeUrl": "/settings/plan"
}
```

**Frontend:** Componente `<PlanGate plan="pro">` que mostra conteudo ou CTA de upgrade.

**Implementacao:**
- Decorator `@PlanRequired('pro')` + `PlanGuard` que le `tenant.plan` do Redis
- `PlanGuard` injeta `tenant.plan` no request para uso em services
- Limits (quick replies count, report period) checados nos services, nao no guard

#### 7.6 EasyPanel Provisioning Runbook
Documento operacional para provisionar N8N por cliente.

**Entregavel:** Arquivo `docs/runbooks/provision-client.md` com:

1. **Criar app N8N no EasyPanel** (click-by-click com screenshots)
   - Image: `docker.n8n.io/n8nio/n8n:latest`
   - Env vars template:
     ```
     N8N_HOST={cliente}.n8n.shkgroups.com
     N8N_PROTOCOL=https
     N8N_ENCRYPTION_KEY={gerado}
     DB_TYPE=sqlite
     EXECUTIONS_DATA_PRUNE=true
     EXECUTIONS_DATA_MAX_AGE=168
     GENERIC_TIMEZONE=America/Sao_Paulo
     ```
   - Domain: `{cliente}.n8n.shkgroups.com`
   - Volume: `/home/node/.n8n`

2. **Importar fluxo V6.0**
   - Upload JSON via N8N UI
   - Ajustar webhook path: `/shkgroupwpp` -> `/{instancia}wpp`
   - Configurar credentials: OpenAI, MercadoPago (do cliente), Redis (compartilhado)

3. **Criar instancia Evolution API**
   - POST na Evolution API para criar instancia com nome `{instancia}`
   - Configurar webhook URL: `https://{cliente}.n8n.shkgroups.com/webhook/{instancia}wpp`

4. **Registrar tenant na API**
   - Se criado via subscription webhook: ja existe com `pending_setup`
   - Se manual: POST no `SuperAdminController` para criar

5. **Personalizar prompt**
   - Abrir AI Agent3 no N8N do cliente
   - Substituir persona, produtos, precos, tom de voz
   - Testar com mensagem de teste

6. **Tempo estimado por cliente**: 30-45 minutos

### P1 - Pos-lancamento

#### 7.7 Alertas no Painel
Notificacoes quando o fluxo detecta palavras criticas.

#### 7.8 Landing Page
Pagina de vendas com os 3 planos e CTA para cadastro.

#### 7.9 Migracao Google Sheets -> Postgres
O CRM via Google Sheets e temporario. Quando atingir ~15 clientes simultaneos, as rate limits da Google API (300 req/min por projeto) podem ser problema. Migrar leads/CRM para Postgres resolve isso e habilita relatorios historicos sem limite de periodo.

#### 7.10 Monitoramento operacional
Para rodar 10+ N8N containers de forma confiavel:
- Health check automatico por container (EasyPanel ja faz restart automatico)
- Alerta WhatsApp para SHK quando: container crashou, WhatsApp desconectou, Redis memory > 80%
- Dashboard operacional no SuperAdmin com status de cada N8N

## 8. Pricing Tiers (from V6.0 prompt)

| Feature | START R$99,90/mes | PRO R$197,90/mes | OBSIDIAN R$547,90/mes |
|---------|-------------------|-------------------|------------------------|
| Dashboard | Sim | Sim | Sim |
| Conversas | Sim | Sim | Sim |
| Kanban | Sim | Sim | Sim |
| Feed | Sim | Sim | Sim |
| Canais | 1 WhatsApp | 2 canais | Ilimitado |
| Relatorios | Basico (7 dias) | Semanal (30 dias) | Full analytics (90 dias) |
| Alertas | Nao | Email | Email + WhatsApp |
| Quick replies | 5 | 20 | Ilimitado |
| Reminders | Nao | Sim | Sim |
| Suporte | Comunidade | 4h prioritario | 1h VIP dedicada |

## 9. Infrastructure Costs

### Shared stack baseline (always running)
| Servico | RAM |
|---------|-----|
| nexus-api (NestJS) | ~200MB |
| nexus-web (Next.js) | ~300MB |
| Redis | ~100MB (cresce com clientes) |
| Evolution API | ~300MB |
| **Baseline total** | **~900MB** |

### Per-client incremental cost
| Recurso | Por cliente | 10 clientes | 30 clientes |
|---------|------------|-------------|-------------|
| N8N container | ~256MB RAM | 2.5GB | 7.5GB |
| Redis namespace | ~5MB | 50MB | 150MB |
| Evolution instancia | ~50MB | 500MB | 1.5GB |
| **Incremental total** | **~310MB** | **~3GB** | **~9.2GB** |

### VPS total (EasyPanel)
| Fase | Clientes | RAM necessaria | Custo estimado |
|------|----------|---------------|----------------|
| Inicio | 1-5 | ~2.5GB total | 4GB VPS ~R$80/mes |
| Crescimento | 6-10 | ~4GB total | 8GB VPS ~R$150/mes |
| Escala | 11-30 | ~10GB total | 16GB VPS ~R$300/mes |

**Break-even**: 1 cliente START (R$99,90) ja cobre a VPS inicial.

## 10. Security & Isolation

- **Network**: Cada N8N container so acessa Redis e Evolution API via rede Docker interna
- **Redis namespace**: Dados isolados por `chat:{instancia}:*` — enforcement via `@Tenant()` decorator na API
- **Risco aceito (MVP)**: Isolamento Redis e por convencao de aplicacao, nao por ACL. Aceitavel porque os N8N sao gerenciados pela SHK (nao pelo cliente) e a API valida tenant via JWT. Mitigacao futura: Redis ACL por tenant ou migracao para Redis databases separados.
- **JWT**: Token contem `instancia` e `role`, API filtra tudo por tenant
- **N8N**: Cada instancia tem credentials proprias (MercadoPago, OpenAI) — compromisso de um nao afeta outros
- **EasyPanel**: N8N do cliente acessivel apenas pela SHK (subdominio interno, sem exposicao publica)
- **Webhook subscription**: Validacao HMAC + fetch confirmatorio na API MercadoPago
- **Redis persistence**: Habilitar AOF (appendonly yes) + backup diario via cron do EasyPanel. TenantRegistry e dado critico — perda de Redis = perda de todos os tenants.

## 11. Onboarding Pipeline

```
1. Cliente assina plano (MercadoPago Subscriptions)
   -> MP envia webhook preapproval.authorized
   -> API cria tenant com status: pending_setup, plan: {tier}
   -> Notificacao WhatsApp para admin SHK com dados do novo cliente
   -> Cliente recebe email de boas-vindas (Resend)

2. SHK configura N8N (manual, ~20min)
   -> Cria app N8N no EasyPanel (seguindo runbook)
   -> Importa fluxo V6.0
   -> Personaliza prompt/persona do agente
   -> Configura credentials (MP do cliente, OpenAI, Redis)
   -> Marca onboarding.n8nReady = true no admin

3. SHK configura Evolution API (manual, ~10min)
   -> Cria nova instancia WhatsApp no Evolution
   -> Aponta webhook para N8N do cliente
   -> Marca onboarding.evolutionReady = true no admin

4. SHK envia magic link para cliente
   -> Cliente acessa painel
   -> Escaneia QR code (conecta WhatsApp)
   -> onboarding.whatsappConnected = true (detectado automaticamente via Evolution)
   -> Status muda para trial

5. Periodo de teste (48h)
   -> SHK monitora no SuperAdmin e refina prompt
   -> Cliente testa e da feedback
   -> Marca onboarding.promptApproved = true

6. Go-live
   -> Admin marca tenant como active no SuperAdmin
   -> Cobranca recorrente ja esta ativa desde o passo 1

Rollback/edge cases:
- Se SHK nao completa setup em 24h: lembrete automatico no WhatsApp
- Se QR code falha: cliente pode tentar novamente na tela /connect
- Se cliente cancela antes do go-live: status -> cancelled, containers removidos
- Cliente em pending_setup pode acessar o painel mas ve apenas tela de "Setup em andamento"
```

## 12. Multi-user and Existing Admin

O `TenantEntry.users` ja suporta array de usuarios e o `AdminController` existente tem endpoints `addUser/removeUser`. Para MVP, essa funcionalidade existe mas nao e promovida:
- Cada tenant recebe 1 usuario admin no cadastro
- A capacidade de adicionar mais usuarios existe na API mas nao tem UI
- Se um cliente pedir, SHK adiciona via API diretamente
- UI de gestao de usuarios e P2 (post-lancamento)

## 13. Out of Scope (YAGNI)

- Editor de prompt/fluxo no painel (SHK faz direto no N8N)
- Configuracao de integracoes pelo cliente
- UI de gestao de multi-usuarios (API existe, sem UI)
- Multi-idioma (PT-BR only)
- App mobile nativo (responsivo suficiente)
- Self-service total de onboarding
- Fluxo N8N compartilhado com roteamento por tenant
- Redis ACL por tenant (enforcement por convencao e suficiente para MVP)
- Migracao para Postgres (P1, quando Sheets virar gargalo)
