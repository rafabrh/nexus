# NEXUS Panel — Design Spec

## 1. Visão Geral

Painel web standalone para operadores da SHK GROUP.IA controlarem e monitorarem o agente NEXUS (IA que atende via WhatsApp). Diferencial: visibilidade em tempo real do atendimento automático por IA + controle humano sobre quando intervir.

**Referência visual:** WA Workflow (WAWF) — layout 3 colunas estilo WhatsApp melhorado, funcional e profissional, sem estética "IA".

**Stack:** Next.js 14 (frontend) + NestJS/Fastify (backend, já implementado) + Redis (estado) + Socket.IO (realtime).

---

## 2. Design System

### 2.1 Paleta de Cores

Tema escuro. Paleta verde/teal profissional.

```
Background:
  --bg-base:      #0C0F12     (fundo principal)
  --bg-surface:   #141820     (cards, painéis)
  --bg-elevated:  #1A2029     (elementos elevados, hover)
  --bg-hover:     #1F2733     (hover states)
  --bg-active:    #253040     (item selecionado)

Brand/Primary (teal):
  --primary-400:  #2DD4BF
  --primary-500:  #14B8A6
  --primary-600:  #0D9488
  --primary-700:  #0F766E
  --primary-800:  #115E59

Texto:
  --text-primary:   #E8ECF1   (principal)
  --text-secondary: #8B95A5   (secundário)
  --text-muted:     #505B6B   (desativado/muted)
  --text-inverse:   #0C0F12   (texto sobre fundo claro)

Bordas:
  --border-default: #1E2530
  --border-hover:   #2A3545
  --border-active:  #0D9488

Semânticas:
  --success:  #22C55E   (IA ativa, pago, online)
  --warning:  #F59E0B   (lead quente, IA pausada, pendente)
  --error:    #EF4444   (offline, erro, urgente)
  --info:     #3B82F6   (informativo)

Status IA:
  --ai-on:       #22C55E   (verde — IA respondendo)
  --ai-paused:   #F59E0B   (amarelo — IA pausada temporariamente)
  --ai-off:      #8B95A5   (cinza — controle manual)
  --ai-thinking: #3B82F6   (azul pulsante — IA processando)
```

### 2.2 Tipografia

```
Font family: Inter (sans-serif), system-ui fallback
Font mono:   JetBrains Mono (dados técnicos, JIDs)

Escala:
  xs:   0.6875rem / 11px   (badges, timestamps)
  sm:   0.75rem   / 12px   (labels, secundários)
  base: 0.8125rem / 13px   (corpo principal — compacto)
  md:   0.875rem  / 14px   (titulos de seção)
  lg:   1rem      / 16px   (titulos de painel)
  xl:   1.25rem   / 20px   (KPI values)
  2xl:  1.5rem    / 24px   (pagina titulo)
```

### 2.3 Componentes Base

- **Bordas:** 1px solid `--border-default`, radius 8px (cards), 6px (inputs), 4px (badges)
- **Sombras:** mínimas — apenas em elementos flutuantes (dropdowns, modais)
- **Transições:** 150ms ease-out (hover states), 200ms (abertura de painéis)
- **Scrollbar:** 4px, track transparente, thumb `#1E2530`, hover `#2A3545`
- **Icones:** Lucide React, 16px padrão, 14px em badges, 20px em botões de ação

---

## 3. Arquitetura de Layout

### 3.1 Estrutura Principal (3 colunas)

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR (48px)                                             │
│  [Logo SHK] [Conversas] [Kanban] [Dashboard] [Feed IA]  .. [Bell] [User] │
├──────────┬──────────────────────────┬───────────────────────┤
│ SIDEBAR  │  MAIN CONTENT            │  DETAIL PANEL         │
│ (320px)  │  (flex)                  │  (380px, colapsável)  │
│          │                          │                       │
│ Busca    │  - Tab Conversas: Chat   │  - Info do lead       │
│ Filtros  │  - Tab Kanban: Board     │  - Stage do funil     │
│ Lista de │  - Tab Dashboard: KPIs   │  - Tags               │
│ conversas│  - Tab Feed IA: Live     │  - Notas              │
│          │                          │  - Quick replies       │
│          │                          │  - Lembretes           │
│          │                          │  - Timeline            │
│          │                          │  - Controle IA         │
└──────────┴──────────────────────────┴───────────────────────┘
```

### 3.2 Top Bar (48px)

Fixa no topo. Fundo `--bg-surface`, borda inferior `--border-default`.

Conteúdo:
- **Esquerda:** Logo SHK GROUP.IA (texto, não imagem) + indicador de instância conectada (dot verde + nome)
- **Centro:** Tabs de navegação:
  - `Conversas` — padrão, abre vista 3 colunas com chat
  - `Kanban` — board drag-and-drop do funil
  - `Dashboard` — KPIs e métricas
  - `Feed IA` — feed ao vivo das respostas da IA em todas as conversas
- **Direita:**
  - Botão de notificações (bell icon) com badge de contagem
  - Avatar/email do usuário + dropdown (Perfil, Logout)

### 3.3 Sidebar Esquerda (320px)

Sempre visível. Fundo `--bg-surface`, borda direita `--border-default`.

**Topo:**
- Input de busca (icone lupa, placeholder "Buscar conversa...")
- Filtros inline (chips clicáveis):
  - `Todos` | `IA Ativa` | `Humano` | `Hot` | por Stage (S0-S6)

**Lista de conversas:**
Cada item mostra:
- Avatar (inicial do nome, fundo `--bg-elevated`)
- Nome do contato (bold) + timestamp relativo ("2min", "1h")
- Preview da última mensagem (truncada 1 linha, `--text-secondary`)
- Badge de status da IA:
  - Verde pulsante: IA ativa e respondendo
  - Azul pulsante: IA pensando (processando)
  - Amarelo: IA pausada (timer mostrando tempo restante)
  - Cinza: controle manual
- Indicador de lead quente: borda lateral esquerda amarela (2px)
- Badge de stage: pill com cor do estágio (ex: "S3" em amarelo)
- Count de mensagens não lidas (se houver)

**Item selecionado:** fundo `--bg-active`, borda esquerda 2px `--primary-500`

**Ordenação:** por lastActivity desc (mais recente no topo). Conversas com IA pensando aparecem no topo com brilho sutil.

### 3.4 Área Principal (flex)

Muda conforme a tab ativa na top bar.

#### Tab: Conversas (padrão)

Exibe o chat da conversa selecionada na sidebar.

**Header do chat (56px):**
- Nome do contato + telefone mascarado
- Status da IA (badge inline)
- Botões de ação:
  - `Assumir` (quando IA ativa) — pausa IA e assume, com popup de confirmação e opção de timer
  - `Devolver pra IA` (quando manual) — reativa IA
  - `Mais` (dropdown): ver perfil, marcar como hot, adicionar tag rápida

**Área de mensagens:**
- Scroll vertical, mensagens mais recentes embaixo
- Mensagens do cliente: bolha alinhada à esquerda, fundo `--bg-elevated`
- Mensagens da IA/operador: bolha alinhada à direita, fundo `--primary-800`
- Indicador de quem enviou: "NEXUS IA" ou "Você" em label xs acima da bolha
- Quando IA está pensando: bolha de "digitando..." com 3 dots animados + label "NEXUS IA está digitando"
- Timestamps entre grupos de mensagens (separador com data)

**Input de mensagem (64px):**
- Textarea expansível (1-4 linhas)
- Botão enviar (ícone send) — primary color
- Botão quick reply (ícone lightning) — abre popup com templates
- Botão anexo (ícone paperclip) — para futuro
- Aviso visual se IA está ativa: "IA está respondendo esta conversa. Enviar uma mensagem irá pausar a IA."

#### Tab: Kanban

Board horizontal drag-and-drop com os 7 estágios do funil:

```
S0 Primeiro contato → S1 Interesse → S2 Descoberta → S3 Apresentação → S4 Proposta → S5 Negociação → S6 Fechamento
```

Cada coluna:
- Header: nome do estágio + contagem + cor do estágio
- Cards draggáveis representando leads/conversas
- Card mostra: nome, telefone mascarado, badge IA status, tag principal, tempo no estágio

Arrastar card entre colunas atualiza `followup_step` no Redis.

#### Tab: Dashboard

Grid de KPIs + gráficos:

**Linha 1 — KPI cards (4 colunas):**
- Leads ativos (total de conversas ativas)
- Receita hoje (soma de valores pagos)
- Taxa de conversão (% leads que pagaram)
- Tempo médio de resposta (da IA)

**Linha 2 — Gráficos (2 colunas):**
- Funil visual (barras horizontais empilhadas por stage)
- Atividade recente (lista cronológica de eventos)

**Linha 3 — Tabela:**
- Leads pagos hoje (nome, valor, horário, stage de origem)

#### Tab: Feed IA

Feed cronológico de todas as interações da IA em tempo real:

Cada entrada mostra:
- Timestamp
- Nome do contato + JID mascarado
- O que o cliente disse (bolha esquerda, compacta)
- O que a IA respondeu (bolha direita, compacta)
- Status: respondido / pensando / handoff
- Botão rápido: "Assumir" / "Ver conversa"

Usa Socket.IO para atualização em tempo real. Eventos `ai.responded`, `message.received`, `ai.thinking`, `handoff.triggered`.

### 3.5 Painel de Detalhe Direito (380px, colapsável)

Visível quando uma conversa está selecionada. Toggle via botão no header do chat. Fundo `--bg-surface`, borda esquerda `--border-default`.

**Seções (acordeão ou scroll contínuo):**

#### Seção: Info do Lead
- Nome completo
- Telefone (mascarado, com botão "revelar" para admin)
- Email (se disponível)
- Origem (de onde veio o lead)
- Primeiro contato (data)
- Total de interações
- Indicador de lead quente (toggle manual + detecção automática)

#### Seção: Controle da IA
- Status atual (ON / Pausada / Manual) com indicador visual
- Botão toggle ON/OFF
- Opção "Pausar por X minutos" (15, 30, 60, custom)
- Timer visual quando pausada (countdown)
- Log das últimas ações de toggle (quem pausou, quando, por quanto tempo)

#### Seção: Estágio do Funil
- Stage atual com cor e label
- Barra de progresso visual (0-100%)
- Dropdown para mudar stage manualmente
- Histórico de mudanças de stage (timeline mini)

#### Seção: Tags
- Tags atuais como chips removíveis
- Input para adicionar nova tag (com autocomplete das tags existentes)
- Tags sugeridas baseadas no comportamento (ex: "respondeu-rapido", "mencionou-preco")

#### Seção: Notas Internas
- Lista de notas com timestamp e quem criou
- Input para adicionar nota
- Notas são privadas (cliente não vê)

#### Seção: Quick Replies
- Lista de templates salvos
- Busca por nome/conteúdo
- Botão "usar" que insere no input de mensagem
- Botão "novo template" com input de nome + conteúdo

#### Seção: Lembretes
- Lista de lembretes ativos para esta conversa
- Criar lembrete: "Lembrar em [15min/1h/2h/amanhã/custom]" + nota do lembrete
- Lembretes disparam notificação no painel (badge na bell)
- Status: pendente / disparado / descartado

#### Seção: Timeline de Eventos
- Lista cronológica de todos os eventos do lead:
  - Primeiro contato
  - Mudanças de estágio
  - Handoffs (IA → humano)
  - Reativações de IA
  - Notas adicionadas
  - Tags alteradas
  - Pagamento confirmado
- Cada evento: ícone + label + timestamp relativo
- Scroll infinito (carrega do Redis stream)

---

## 4. Autenticação e Segurança

### 4.1 Fluxo de Login

1. Tela de login: input de email + botão "Enviar link de acesso"
2. API envia magic link via Resend (ou loga no console em dev)
3. Usuário clica no link → callback no frontend → troca token por JWT pair
4. Sessão de 30 dias (refresh token com rotation)

**Tela de login:**
- Centrada, fundo `--bg-base`
- Card central com logo SHK, título "NEXUS Panel", input de email, botão submit
- Feedback de envio: "Link enviado para seu email"
- Mensagem de erro se falhar (genérica, sem revelar se email existe)

### 4.2 Segurança

- **Access token:** JWT, 15 min TTL, contém `sub` (email), `instancia`, `role`
- **Refresh token:** JWT, 30 dias TTL, armazenado em cookie httpOnly + Secure + SameSite=Strict
- **Refresh token rotation:** cada refresh gera novo par e invalida o anterior
  - **NOTA (backend fix):** o método `refresh()` em `auth.service.ts` atualmente só gera novo access token. Precisa ser alterado para: gerar novo refresh token, blacklistar o anterior, retornar ambos.
  - **NOTA (backend fix):** `JWT_REFRESH_EXPIRATION_MS` default é 7 dias (604800000ms). Alterar para 30 dias (2592000000ms). Atualizar também o `maxAge` do cookie `refresh_token` em `auth.controller.ts`.
- **Blacklist:** tokens revogados ficam em Redis com TTL igual ao do token
- **CSRF:** double-submit cookie pattern — token CSRF no header + cookie
  - **NOTA (backend fix):** CSRF não está implementado. Adicionar middleware que gera token CSRF no cookie e valida header `X-CSRF-Token` em requests mutantes (POST/PUT/PATCH/DELETE).
- **Rate limiting:** 5 tentativas de magic link por email/hora, 20/hora global por IP
  - **NOTA (backend fix):** Rate limiting não está implementado. Integrar `@nestjs/throttler` com config customizada no endpoint de magic link.
- **Helmet headers:** CSP, X-Frame-Options, HSTS
  - **NOTA (backend fix):** Registrar `@fastify/helmet` em `main.ts`.
- **Tenant isolation:** todo request autenticado tem `instancia` no JWT, validado no guard (já implementado)
- **Proteção contra enumeração:** magic link sempre retorna 200, mesmo se email não existir (já implementado)
- **Socket.IO auth:** token JWT validado no handshake, desconecta se inválido (já implementado)

### 4.3 Roles

- `admin` — acesso total, pode ver dados sensíveis (telefone completo), gerenciar tenants
- `operator` — acesso ao painel da própria instância, dados mascarados

---

## 5. Realtime (Socket.IO)

### 5.1 Eventos do Servidor → Cliente

O backend emite um **evento único** `nexus-event` com envelope contendo `type`, `instancia`, `jid`, `ts`, `payload`. O frontend escuta `socket.on('nexus-event', handler)` e despacha pelo `type`.

**Eventos atualmente emitidos pelo backend (via KeyspaceListener → EventTranslator → EventPublisher):**

| type no envelope | Gerado? | Payload atual | Efeito no UI |
|--------|---------|---------|-------------|
| `message.received` | SIM | `{}` (vazio) | Invalidar query de mensagens + atualizar sidebar |
| `ai.thinking` | SIM | `{}` (vazio) | Indicador "digitando" no chat + badge azul na sidebar |
| `ai.responded` | SIM | `{}` (vazio) | Invalidar query de mensagens + entry no Feed IA |
| `ai.toggled` | SIM | `{state}` | Atualiza badge de status na sidebar + painel detalhe |
| `payment.approved` | SIM | `{}` (vazio) | Notificação + atualiza dashboard |

**Eventos que precisam ser implementados no backend:**

| type | Trigger | Payload necessário | Efeito no UI |
|--------|---------|---------|-------------|
| `funnel.changed` | Quando `followup_step` muda (adicionar keyspace pattern) | `{fromStage, toStage}` | Move card no Kanban + atualiza sidebar |
| `handoff.triggered` | Quando operador assume conversa (emitir no AI control toggle) | `{reason}` | Notificação + destaque na sidebar |
| `lead.hot` | Quando detecção automática de lead quente ativa | `{reason}` | Borda amarela na sidebar + notificação |
| `note.added` | Quando nota é adicionada (emitir no ConversationService) | `{text}` | Atualizar painel detalhe |

**NOTA (backend fix):** Os payloads atuais são vazios (`{}`). O frontend contorna isso invalidando queries do TanStack Query ao receber o evento (re-fetch dos dados atualizados). Para eventos como `message.received`, enriquecer o payload com `{content, mediaType}` no `EventTranslator` lendo o valor da chave Redis melhora a UX (evita flash de loading).

### 5.2 Reconexão

- Socket.IO auto-reconnect com backoff exponencial
- No reconnect, emitir `replay` com último `eventId` para receber eventos perdidos
- Indicador visual de conexão no top bar (dot verde/vermelho ao lado do logo)

---

## 6. Dados e Estado (Frontend)

### 6.1 State Management

**Zustand** para estado global:

- `authStore` — tokens, user info, instância
- `conversationStore` — lista de conversas, conversa selecionada, filtros
- `realtimeStore` — status conexão Socket.IO, último eventId
- `uiStore` — painel detalhe aberto/fechado, tab ativa, notificações

### 6.2 Data Fetching

**TanStack Query** para dados do servidor:

- `useConversations(instancia, filters)` — lista de conversas
- `useConversationDetail(instancia, jid)` — detalhe + notas + tags
- `useMessages(instancia, jid)` — histórico de mensagens
- `useDashboard(instancia)` — dados do dashboard
- `useLeads(instancia)` — lista de leads para Kanban

Invalidação automática via eventos Socket.IO (quando recebe evento, invalida query relevante).

### 6.3 Quick Replies

Armazenados no **backend via API** (por tenant, compartilhados entre operadores). Estrutura:

```ts
interface QuickReply {
  id: string;
  name: string;       // "Boas-vindas", "Link de pagamento"
  content: string;    // texto da mensagem
  shortcut?: string;  // "/bv", "/pag"
}
```

### 6.4 Lembretes

Armazenados no Redis via endpoint dedicado (a criar no backend):

```ts
interface Reminder {
  id: string;
  instancia: string;
  jid: string;
  text: string;          // "Seguir com proposta"
  triggerAt: string;     // ISO timestamp
  createdBy: string;     // email do operador
  status: 'pending' | 'fired' | 'dismissed';
}
```

Chave Redis: `reminder:{instancia}:{id}`
Listagem por sorted set: `reminders:{instancia}` com score = triggerAt timestamp.
Cron job no backend a cada 60s verifica lembretes vencidos e emite evento Socket.IO.

---

## 7. Endpoints da API (Novos / Ajustes)

Todos os endpoints usam o prefix `api/v1` (definido em `main.ts`).

Endpoints existentes que já funcionam:
- `POST /api/v1/auth/magic-link`
- `GET /api/v1/auth/callback`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:jid`
- `GET /api/v1/conversations/:jid/messages`
- `POST /api/v1/conversations/:jid/notes`
- `DELETE /api/v1/conversations/:jid/notes/:index`
- `POST /api/v1/conversations/:jid/tags`
- `DELETE /api/v1/conversations/:jid/tags/:tag`
- `POST /api/v1/conversations/:jid/send`
- `GET/POST /api/v1/conversations/:jid/ai`
- `GET /api/v1/dashboard`
- `GET /api/v1/leads`
- `POST /api/v1/webhook/evolution`
- `GET /api/v1/whatsapp/instances`
- `GET /api/v1/whatsapp/instances/:name/state`
- `GET /api/v1/integrations/status`
- `GET/POST/PATCH /api/v1/admin/tenants[/:instancia]`
- `GET /health[/liveness|/readiness]` (sem prefix)
- `GET /metrics` (sem prefix)

Novos endpoints necessários:

```
POST   /api/v1/conversations/:jid/stage      — mudar estágio do funil
POST   /api/v1/conversations/:jid/hot        — toggle lead quente

POST   /api/v1/reminders                     — criar lembrete
GET    /api/v1/reminders                     — listar lembretes (filtro: ?status=pending)
PATCH  /api/v1/reminders/:id                 — dismiss/update
DELETE /api/v1/reminders/:id                 — deletar

GET    /api/v1/quick-replies                 — listar templates (por tenant)
POST   /api/v1/quick-replies                 — criar template
PATCH  /api/v1/quick-replies/:id             — editar template
DELETE /api/v1/quick-replies/:id             — deletar template
```

---

## 8. Estrutura de Arquivos (Frontend)

```
apps/web/src/
├── app/
│   ├── layout.tsx                 # Root layout (providers, font, meta)
│   ├── page.tsx                   # Redirect → /login ou /conversations
│   ├── login/
│   │   └── page.tsx               # Tela de login
│   ├── auth/
│   │   └── callback/
│   │       └── page.tsx           # Callback do magic link
│   └── (app)/                     # Layout group (autenticado)
│       ├── layout.tsx             # AppLayout (top bar, sidebar, socket)
│       ├── conversations/
│       │   └── page.tsx           # Vista 3 colunas com chat
│       ├── kanban/
│       │   └── page.tsx           # Kanban board
│       ├── dashboard/
│       │   └── page.tsx           # Dashboard KPIs
│       └── feed/
│           └── page.tsx           # Feed IA ao vivo
├── components/
│   ├── layout/
│   │   ├── top-bar.tsx
│   │   ├── sidebar.tsx
│   │   └── detail-panel.tsx
│   ├── chat/
│   │   ├── message-list.tsx
│   │   ├── message-bubble.tsx
│   │   ├── message-input.tsx
│   │   ├── typing-indicator.tsx
│   │   └── chat-header.tsx
│   ├── conversation/
│   │   ├── conversation-item.tsx
│   │   ├── conversation-filters.tsx
│   │   └── ai-status-badge.tsx
│   ├── detail/
│   │   ├── lead-info.tsx
│   │   ├── ai-control.tsx
│   │   ├── funnel-stage.tsx
│   │   ├── tags-section.tsx
│   │   ├── notes-section.tsx
│   │   ├── quick-replies.tsx
│   │   ├── reminders-section.tsx
│   │   └── event-timeline.tsx
│   ├── kanban/
│   │   ├── kanban-board.tsx
│   │   ├── kanban-column.tsx
│   │   └── kanban-card.tsx
│   ├── dashboard/
│   │   ├── kpi-card.tsx
│   │   ├── funnel-chart.tsx
│   │   └── activity-feed.tsx
│   ├── feed/
│   │   └── ai-feed-entry.tsx
│   └── ui/
│       ├── button.tsx
│       ├── input.tsx
│       ├── badge.tsx
│       ├── dropdown.tsx
│       ├── modal.tsx
│       ├── tooltip.tsx
│       └── spinner.tsx
├── lib/
│   ├── api.ts                     # fetch wrapper com auth
│   ├── socket.ts                  # Socket.IO client
│   ├── utils.ts                   # cn(), timeAgo(), formatCurrency()
│   └── constants.ts               # cores de stage, labels, etc.
├── stores/
│   ├── auth.ts                    # zustand auth store
│   ├── conversations.ts           # zustand conversation state
│   ├── realtime.ts                # zustand socket state
│   └── ui.ts                      # zustand UI state
└── hooks/
    ├── use-conversations.ts       # TanStack Query hooks
    ├── use-messages.ts
    ├── use-dashboard.ts
    ├── use-socket.ts              # Socket.IO hook
    └── use-reminders.ts
```

---

## 9. Indicador de Lead Quente (Detecção Automática)

Critérios (avaliados no backend quando eventos chegam):
1. Respondeu nos últimos 5 minutos
2. Está em estágio S3+ (Apresentação ou acima)
3. Mensagem contém palavras-chave: "preço", "valor", "comprar", "pagar", "link", "plano"
4. Taxa de resposta alta (3+ mensagens em 10 minutos)

Se 2+ critérios atendidos → emite evento `lead.hot` via Socket.IO.

Operador também pode marcar/desmarcar manualmente.

---

## 10. Notificações

Sistema de notificações in-app:

- Badge na bell (top bar) com contagem
- Dropdown lista as últimas 20 notificações
- Tipos:
  - `handoff` — "Carlos Souza precisa de atendimento humano"
  - `payment` — "Fernanda Costa pagou R$ 497"
  - `lead_hot` — "Ana Silva está quente — respondendo rápido"
  - `reminder` — "Lembrete: seguir com proposta para Pedro"
  - `ai_error` — "IA falhou ao responder Julia (timeout)"
- Som de notificação (toggle on/off no perfil)
- Notificações chegam via Socket.IO em tempo real

---

## 11. Backend Fixes Necessários (pré-requisitos)

Antes do frontend funcionar corretamente, o backend precisa de ajustes:

### Críticos (segurança)
1. **Refresh token rotation** — `auth.service.ts:refresh()` deve gerar novo refresh token e blacklistar o anterior
2. **Refresh TTL 30 dias** — alterar `JWT_REFRESH_EXPIRATION_MS` default para 2592000000 e cookie `maxAge` para 2592000
3. **CSRF protection** — implementar double-submit cookie middleware
4. **Rate limiting** — integrar `@nestjs/throttler` no endpoint de magic link
5. **Helmet** — registrar `@fastify/helmet` em `main.ts`

### Funcionalidade
6. **`lastMessagePreview`** — `conversation.repository.ts` retorna `''`. Precisa ler última entrada de `chathistory:{inst}-{phone}` e extrair content
7. **`lastActivity`** — retorna `new Date().toISOString()`. Precisa derivar do timestamp real da última mensagem ou keyspace event
8. **`isHot` lógica** — atualmente hardcoded como `stage === 'S6'`. Implementar multi-critério conforme seção 9
9. **Eventos faltantes** — implementar emissão de `funnel.changed`, `handoff.triggered`, `lead.hot`, `note.added`
10. **Payloads dos eventos** — enriquecer `EventTranslator` para incluir dados úteis no payload (content, mediaType, etc.)
11. **Keyspace pattern para `followup_step`** — adicionar em `keyspace.listener.ts` para gerar `funnel.changed`

### Novos recursos
12. **Reminders** — novo módulo com service, controller, scheduler (cron 60s para verificar lembretes vencidos)
13. **Quick Replies** — novo módulo server-side com CRUD via Redis
14. **Stage update** — endpoint `POST /conversations/:jid/stage` + emissão de evento
15. **Hot toggle** — endpoint `POST /conversations/:jid/hot` + chave Redis `chat:{inst}:{jid}:isHot`

### Novas Redis Keys necessárias
```
reminder:{instancia}:{id}        — hash com dados do lembrete
reminders:{instancia}            — sorted set (score = triggerAt)
chat:{inst}:{jid}:isHot          — "true" ou inexistente
quickreplies:{instancia}         — hash com id → JSON do template
```

---

## 12. Fora do Escopo (Fase Futura)

- Modo supervisão (aprovar respostas da IA antes do envio)
- Envio de mídia (imagens, áudio, documentos)
- Múltiplos operadores simultâneos na mesma conversa
- Relatórios exportáveis (CSV/PDF)
- Integração com calendário
- App mobile
