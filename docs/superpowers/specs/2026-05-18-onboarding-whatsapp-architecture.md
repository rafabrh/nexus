# NEXUS Panel — Onboarding WhatsApp & Arquitetura de Conexao

**Data:** 2026-05-18
**Status:** Aprovado
**Autor:** Rafa (SHK) + Claude

---

## 1. Contexto e Objetivo Tecnico

**Objetivo:** Implementar o fluxo de onboarding e conexao WhatsApp do NEXUS Panel, transformando-o de um painel que depende de dados pre-populados no Redis em um sistema auto-suficiente onde cada cliente conecta seu WhatsApp Business, sincroniza seu historico e opera sobre seus dados reais.

**Problemas tecnicos do estado atual:**

1. **Sem mecanismo de conexao** — `EvolutionClient` nao tem endpoints de criar instancia nem gerar QR code. O painel assume que dados ja existem no Redis.
2. **Webhook `connection.update` e ignorado** — O `WebhookService` loga mas nao propaga mudancas de estado de conexao. O frontend nao sabe se o WhatsApp esta conectado ou nao.
3. **Sem onboarding** — Nao existe fluxo de primeiro acesso. Um cliente novo loga e ve um painel vazio sem explicacao.
4. **Sem sync inicial** — As conversas so existem no Redis se o webhook ja alimentou. Nao ha mecanismo para importar historico existente.
5. **Tenant sem estado de conexao** — `TenantEntry` nao registra se a instancia esta conectada, se ja sincronizou, ou qual o estado atual.

**Sistemas e features que se conectam:**

| Sistema | Relacao |
|---------|---------|
| **Evolution API** | Fonte de verdade para conexao WhatsApp, QR code, estado da instancia, chats e mensagens |
| **N8N** | Orquestra o agente IA por instancia. Precisa de configuracao por cliente (webhook URL no tenant) |
| **Redis** | Persiste conversas, contatos, estado de funil, historico de mensagens |
| **Socket.IO** | Eventos real-time de conversa (ja existe, se mantem no escopo atual) |
| **Auth (JWT)** | O campo `instancia` no JWT conecta o usuario ao seu tenant/instancia |

---

## 2. Arquitetura Geral

**Topologia — BFF Monolito Modular com Event Pipeline**

```
+---------------------------------------------------------------------+
|                          CLIENTES                                   |
|  Browser (Next.js SSR/CSR) ---- Socket.IO (conversas real-time)     |
+---------------+----------------------------+------------------------+
                | HTTPS (REST)               | WSS
                v                            v
+---------------------------------------------------------------------+
|                     NEXUS BFF (NestJS + Fastify)                    |
|                                                                     |
|  +-----------+ +-----------+ +----------+ +----------------------+  |
|  |   Auth    | | Onboarding| |Conversa- | |  Webhook Ingress     |  |
|  |  Module   | |  Module   | |tion Mod. | |  (Evolution events)  |  |
|  +-----------+ +-----+-----+ +----------+ +----------+-----------+  |
|                      |                               |              |
|            +---------v-------------------------------v------+       |
|            |           Core Layer                           |       |
|            |  Redis Client - Evolution Client - EventPub    |       |
|            +---------------------+--------------------------+       |
+----------------------------------+----------------------------------+
                                   |
                    +--------------+---------------+
                    v              v               v
              +----------+  +----------+  +--------------+
              |  Redis   |  | Evolution|  |    N8N       |
              |  (dados) |  |   API    |  |  (agente IA) |
              +----------+  +----------+  +--------------+
```

**Tecnologias principais e justificativas:**

| Tecnologia | Justificativa |
|---|---|
| **NestJS + Fastify** | Ja adotado. Modular, tipado, performance superior ao Express |
| **Redis** | Ja e a fonte de verdade. Alinhado com N8N (chathistory). Sem banco relacional necessario nesta fase |
| **Socket.IO** | Ja implementado para eventos de conversa. Escopo se mantem |
| **Evolution API v2** | Unica integracao WhatsApp. Endpoints REST para instancias, QR code, chats, mensagens |
| **Next.js 14** | Ja adotado no frontend. SSR para SEO na landing, CSR para o painel autenticado |

**Ambiente de implantacao:**

- **EasyPanel (cloud gerenciado)** — Evolution API ja roda la (`n8n-evolution-api.b8ul3d.easypanel.host`)
- **Primeiro momento:** Single server — API, Redis, frontend no mesmo host
- **Evolucao:** Separar Redis dedicado quando passar de 20 tenants ativos

**Padroes arquiteturais:**

| Padrao | Onde |
|---|---|
| **BFF (Backend for Frontend)** | NestJS serve como unico ponto de contato do frontend |
| **Event-driven (parcial)** | Webhook ingress -> Redis keyspace notifications -> Socket.IO |
| **Repository pattern** | `ConversationRepository` abstrai acesso ao Redis (ja existe) |
| **Module-per-feature** | Cada dominio e um NestJS module isolado (Auth, Onboarding, Conversation, Webhook) |
| **Guard pattern** | JWT + connection state como pre-condicao para acessar rotas do painel |

**Novo modulo: `OnboardingModule`** — Responsavel por todo o ciclo de vida da instancia: criar, gerar QR, monitorar conexao, disparar sync. Isolado dos demais modulos — se comunica via `EvolutionClient` e `Redis`.

---

## 3. Componentes e Responsabilidades

### Novos componentes (a criar)

| Componente | Camada | Responsabilidade |
|---|---|---|
| `OnboardingModule` | API | Orquestra criacao de instancia, QR code, sync |
| `OnboardingController` | API | Expoe endpoints REST: criar instancia, QR code, estado, sync |
| `OnboardingService` | API | Logica de negocio: ciclo de vida da instancia + sync inicial |
| `SyncService` | API | Puxa chats e mensagens da Evolution API e popula Redis |
| `/connect` page | Web | Tela de QR code com polling de estado |
| `ConnectionGuard` | Web | No layout, redireciona para `/connect` se instancia desconectada |

### Componentes existentes que serao estendidos

| Componente | Mudanca |
|---|---|
| `EvolutionClient` | +3 metodos: `createInstance()`, `getQrCode()`, `deleteInstance()` |
| `WebhookService` | `handleConnectionUpdate()` passa a persistir estado no Redis e emitir evento |
| `TenantEntry` (shared) | +campos: `connectionState`, `syncStatus`, `connectedAt`, `n8nWebhookUrl` |
| `RedisKeys` (shared) | +chaves: `instanceState()`, `syncStatus()` |
| `TopBar` | Badge Online/Offline linka para `/connect` quando desconectado |

### Mapa de dependencias

```
OnboardingModule
  +-- EvolutionClient        (cria instancia, gera QR, busca chats/msgs)
  +-- Redis                  (persiste estado, popula conversas)
  +-- TenantRegistry         (atualiza connectionState/syncStatus)
  +-- EventPublisher         (emite sync:progress para o tenant via Socket.IO)

WebhookService (estendido)
  +-- Redis                  (grava instanceState:{inst})
  +-- EventPublisher         (emite connection:state para o room do tenant)

SyncService
  +-- EvolutionClient        (findChats, findMessages, findContacts)
  +-- Redis                  (popula chathistory, contact, followup_step)
  +-- OnboardingService      (atualiza syncStatus no tenant)
```

### Quem persiste, quem cacheia, quem orquestra

| Papel | Componente |
|---|---|
| **Persiste dados de conversa** | `WebhookService` (mensagens novas) + `SyncService` (historico inicial) |
| **Persiste estado de conexao** | `WebhookService` via `connection.update` -> Redis key `instanceState:{inst}` |
| **Persiste config de tenant** | `OnboardingService` atualiza `tenant:registry` no Redis |
| **Cache** | Redis com TTL por camada. Cache-aside com invalidacao ativa por webhook |
| **Orquestra onboarding** | `OnboardingService` — sequencia: criar instancia -> QR -> aguardar conexao -> sync -> liberar painel |
| **Orquestra agente IA** | N8N (externo) — recebe mensagens via webhook da Evolution, nao do NEXUS |

### Estrategia de Cache — Cache-Aside com TTL por Camada

**Padrao:** Cache-aside (lazy-loading) com invalidacao ativa via webhook.

**Camadas de dados no Redis:**

| Camada | Tipo de dado | TTL | Invalidacao |
|---|---|---|---|
| **Quente** | Mensagens ativas, estado de conversa, `humanControlUntil`, `followup_step` | Sem TTL (persistente) | Sobrescrita direta pelo webhook a cada evento |
| **Morna** | Lista de conversas computada, dashboard aggregations, contatos | 30-60s TTL | Invalidada quando webhook recebe `messages.upsert` ou `contacts.update` |
| **Fria** | Historico de mensagens antigas (>7 dias sem atividade), config de tenant | 24h TTL (rebuild on-miss) | Rebuild sob demanda quando cliente abre conversa inativa |

**Fluxo de cache:**

```
GET /api/v1/conversations (lista de conversas)
  1. Checa Redis key "cache:conversations:{instancia}" (TTL 30s)
  2a. Cache HIT -> retorna direto (0 roundtrips extras)
  2b. Cache MISS -> ConversationRepository.findAllJids() + buildListItem()
      -> Grava resultado em "cache:conversations:{instancia}" com TTL 30s
      -> Retorna
  3. Webhook recebe messages.upsert para {instancia}
      -> DEL "cache:conversations:{instancia}" (invalidacao ativa)
      -> Proximo GET reconstroi com dados frescos
```

**Novas chaves Redis para cache:**

| Chave | Conteudo | TTL |
|---|---|---|
| `cache:conversations:{inst}` | JSON da lista computada | 30s |
| `cache:dashboard:{inst}` | Aggregations do dashboard | 60s |
| `cache:contacts:{inst}` | Mapa de contatos do tenant | 60s |
| `instanceState:{inst}` | `open` / `close` / `connecting` | Sem TTL |
| `syncStatus:{inst}` | `pending` / `syncing` / `done` / `error` | Sem TTL |

**Invalidacao ativa no WebhookService:**

- `messages.upsert` -> invalida `cache:conversations:{inst}` + `cache:dashboard:{inst}`
- `contacts.update` -> invalida `cache:contacts:{inst}`
- `connection.update` -> atualiza `instanceState:{inst}` direto (sem TTL)

---

## 4. Fluxo de Requisicoes e Dados

### Fluxo 1 — Primeiro acesso (Onboarding completo)

```
Browser                    NEXUS API                   Evolution API         Redis
  |                           |                            |                   |
  |-- POST /auth/magic-link ->|                            |                   |
  |<-- 200 (email enviado) ---|                            |                   |
  |                           |                            |                   |
  |-- GET /auth/callback ---->|                            |                   |
  |<-- JWT {instancia} ------|                            |                   |
  |                           |                            |                   |
  |-- GET /onboarding/state ->|                            |                   |
  |                           |-- GET instanceState:{inst} ------------------>|
  |                           |<-- null (nao existe) ----------------------|
  |                           |                            |                   |
  |                           |-- POST /instance/create -->|                   |
  |                           |<-- 201 {instanceName} ----|                   |
  |                           |                            |                   |
  |                           |-- SET instanceState:{inst} = "created" ----->|
  |                           |-- UPDATE tenant:registry (connectionState) ->|
  |<-- { state: "created" } --|                            |                   |
  |                           |                            |                   |
  |-- GET /onboarding/qr ---->|                            |                   |
  |                           |-- GET /instance/connect -->|                   |
  |                           |<-- { base64 QR } ---------|                   |
  |<-- { qrCode: "data:..." } |                            |                   |
  |                           |                            |                   |
  |   (cliente escaneia)      |                            |                   |
  |                           |                            |                   |
  |                           |<-- webhook connection.update state=open ------|
  |                           |-- SET instanceState:{inst} = "open" -------->|
  |                           |-- DEL cache:conversations:{inst} ----------->|
  |                           |                            |                   |
  |-- GET /onboarding/state ->| (polling 3s)               |                   |
  |<-- { state: "open" } -----|                            |                   |
  |                           |                            |                   |
  |-- POST /onboarding/sync ->|                            |                   |
  |                           |-- SET syncStatus:{inst} = "syncing" -------->|
  |                           |-- POST /chat/findChats --->|                   |
  |                           |<-- [120 chats] ------------|                   |
  |                           |                            |                   |
  |                           |   (para cada chat com mensagens)               |
  |                           |-- POST /chat/findMessages >|                   |
  |                           |<-- [messages] -------------|                   |
  |                           |-- RPUSH chathistory:{inst}-{phone} --------->|
  |                           |-- SET contact:{phone} ---------------------->|
  |                           |-- SET chat:{inst}:{jid}:followup_step = S0 ->|
  |                           |                            |                   |
  |                           |-- SET syncStatus:{inst} = "done" ----------->|
  |<-- { status: "done", chats: 120, messages: 2340 } ----|                   |
  |                           |                            |                   |
  |-- redirect /conversations |                            |                   |
```

### Fluxo 2 — Login subsequente (sessao ativa)

```
Browser                    NEXUS API                                    Redis
  |                           |                                           |
  |-- POST /auth/refresh ---->|                                           |
  |<-- JWT {instancia} ------|                                           |
  |                           |                                           |
  |-- GET /onboarding/state ->|                                           |
  |                           |-- GET instanceState:{inst} -------------->|
  |                           |<-- "open" -------------------------------|
  |                           |-- GET syncStatus:{inst} ---------------->|
  |                           |<-- "done" -------------------------------|
  |<-- { state: "open", sync: "done" } --|                               |
  |                           |                                           |
  |-- redirect /conversations |  (pula QR + sync completamente)           |
```

### Fluxo 3 — Requisicao tipica (lista de conversas com cache)

```
Browser                    NEXUS API                                    Redis
  |                           |                                           |
  |-- GET /conversations ---->|                                           |
  |                           |-- GET cache:conversations:{inst} -------->|
  |                           |<-- null (MISS) --------------------------|
  |                           |-- SCAN chat:{inst}:*:followup_step ----->|
  |                           |<-- [jid1, jid2, ...jid120] -------------|
  |                           |-- PIPELINE (get state, tags, contact...) >|
  |                           |<-- [results] ----------------------------|
  |                           |-- SET cache:conversations:{inst} (TTL 30s)|
  |<-- [120 conversations] --|                                           |
  |                           |                                           |
  |-- GET /conversations ---->|  (2a chamada, <30s depois)                |
  |                           |-- GET cache:conversations:{inst} -------->|
  |                           |<-- [cached JSON] (HIT) -----------------|
  |<-- [120 conversations] --|  (sem SCAN, sem pipeline)                  |
```

### Fluxo 4 — Webhook invalida cache

```
Evolution API              NEXUS API                                    Redis
  |                           |                                           |
  |-- POST /webhook/evolution |                                           |
  |   { event: "messages.upsert", instance: "inst", data: {...} }         |
  |                           |                                           |
  |                           |-- RPUSH chathistory:{inst}-{phone} ----->|
  |                           |-- SET contact:{phone} ------------------>|
  |                           |-- SET chat:{inst}:{jid}:state = active ->|
  |                           |                                           |
  |                           |-- DEL cache:conversations:{inst} -------->| (invalidacao)
  |                           |-- DEL cache:dashboard:{inst} ------------>| (invalidacao)
  |                           |                                           |
  |                           |-- EventPublisher.publish(message.received) |
  |                           |         |                                 |
  |                           |         +-->  Socket.IO room tenant:{inst} |
```

### Pontos de validacao e transformacao

| Ponto | O que acontece |
|---|---|
| **Controller (entrada)** | Validacao de DTO (class-validator), JWT guard, throttle |
| **Service (logica)** | Verificacao de permissao por tenant (instancia do JWT = instancia do recurso) |
| **EvolutionClient (saida)** | Resilience policy (retry com backoff via cockatiel), timeout 10s |
| **WebhookService (entrada externa)** | Validacao estrutural do payload, descarte de eventos irrelevantes |
| **SyncService (transformacao)** | Normaliza formato Evolution API -> formato Redis (LangChain-compatible) |
| **Cache layer (leitura)** | Check-then-compute com TTL. Invalidacao ativa por webhook |

---

## 5. Modelo de Dados (Alto Nivel)

### Entidades principais e relacoes

```
TenantRegistry (1)
  |
  +-- TenantEntry (N)          "1 tenant = 1 cliente = 1 instancia Evolution"
  |     |
  |     +-- connectionState     open | close | connecting | created
  |     +-- syncStatus          pending | syncing | done | error
  |     +-- connectedAt         timestamp da primeira conexao
  |     +-- n8nWebhookUrl       URL do flow N8N deste tenant
  |     +-- users[]             emails + roles
  |           |
  |           +-- TenantUser
  |                 +-- email
  |                 +-- role     admin | operator
  |
  +-- Instance State
  |     +-- instanceState:{inst}     "open" | "close" | "connecting"
  |
  +-- Sync State
  |     +-- syncStatus:{inst}        "pending" | "syncing" | "done" | "error"
  |
  +-- Conversations (N por tenant)
        |
        +-- chat:{inst}:{jid}:followup_step    "S0".."S6"
        +-- chat:{inst}:{jid}:state            "active"
        +-- chat:{inst}:{jid}:humanControlUntil timestamp
        +-- chat:{inst}:{jid}:paymentStatus    string | null
        +-- chat:{inst}:{jid}:tags             JSON string[]
        +-- chat:{inst}:{jid}:notas            JSON string[]
        +-- chat:{inst}:{jid}:optout           "true" | null
        +-- chat:{inst}:{jid}:isHot            "true" | null
        |
        +-- chathistory:{inst}-{phone}         LIST [LangChain entries]
        |     +-- { type: "ai"|"human", data: { content } }
        |
        +-- contact:{phone}                    JSON { pushName }
```

### Fonte de verdade e politicas de sincronizacao

| Dado | Fonte de verdade | Politica |
|---|---|---|
| **Sessao WhatsApp (conexao)** | Evolution API | Redis espelha via webhook `connection.update`. Se divergir, `GET /connectionState` e o desempate |
| **Mensagens** | Redis (`chathistory:`) | Alimentado pelo webhook (tempo real) e sync inicial (historico). N8N tambem escreve nessa mesma chave — formato LangChain compartilhado |
| **Contatos** | Redis (`contact:`) | Alimentado pelo webhook `contacts.update` e sync inicial. `pushName` e o campo primario |
| **Estado de funil** | Redis (`followup_step`) | N8N avanca o funil conforme o agente IA interage. Painel pode sobrescrever manualmente |
| **Configuracao de tenant** | Redis (`tenant:registry`) | Escrita pelo admin. Lida por todos os modulos |
| **Cache computado** | Redis (`cache:*`) | Derivado dos dados acima. Descartavel — TTL + invalidacao ativa |

### Consideracoes de versionamento e retencao

| Aspecto | Politica |
|---|---|
| **TenantRegistry** | Campo `version` incrementado a cada alteracao. Permite detectar writes concorrentes |
| **Mensagens (chathistory)** | Sem TTL — retencao indefinida. Para tenants inativos (>90 dias sem conexao), politica futura de archival |
| **Cache keys** | TTL auto-expirante (30-60s). Sem necessidade de cleanup manual |
| **Estado de conexao** | Sem TTL — sempre atualizado pelo webhook. Se Evolution API reiniciar, proximo `connection.update` corrige |
| **Sync status** | Sem TTL — persiste para saber se tenant ja sincronizou. Reset manual via admin se necessario |
| **Redis persistence** | RDB snapshots + AOF com `appendfsync everysec`. Perda maxima: ~1s |

### Isolamento de dados entre tenants

Todos os dados sao prefixados por `{instancia}`. Um tenant nunca acessa dados de outro porque:

1. O JWT contem `instancia` — setado no login, imutavel
2. Todo endpoint extrai `instancia` do JWT, nunca do request body
3. Redis keys sao namespaced: `chat:{inst}:*`, `cache:*:{inst}`, `instanceState:{inst}`
4. Socket.IO rooms: `tenant:{inst}` — eventos so chegam ao room correto

---

## 6. Interfaces Publicas

### Endpoints REST — Novos (OnboardingModule)

| Metodo | Rota | Descricao | Auth | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/onboarding/state` | Estado atual da instancia do tenant | JWT | `{ connectionState, syncStatus, instanceExists }` |
| `POST` | `/api/v1/onboarding/instance` | Cria instancia na Evolution API | JWT (admin) | `{ instanceName, state: "created" }` |
| `GET` | `/api/v1/onboarding/qr` | Gera/retorna QR code da instancia | JWT (admin) | `{ qrCode: "base64...", expiresIn: 40 }` |
| `POST` | `/api/v1/onboarding/sync` | Dispara sync inicial de chats e mensagens | JWT (admin) | `{ status, chatsImported, messagesImported }` |
| `POST` | `/api/v1/onboarding/retry-sync` | Re-executa sync em caso de erro | JWT (admin) | `{ status }` |

### Formato de resposta — `/onboarding/state`

```json
// Instancia nao existe (primeiro acesso)
{ "instanceExists": false, "connectionState": null, "syncStatus": null }

// Instancia criada, aguardando QR scan
{ "instanceExists": true, "connectionState": "created", "syncStatus": "pending" }

// QR escaneado, sync em andamento
{ "instanceExists": true, "connectionState": "open", "syncStatus": "syncing" }

// Tudo pronto
{ "instanceExists": true, "connectionState": "open", "syncStatus": "done" }

// Sessao WhatsApp caiu
{ "instanceExists": true, "connectionState": "close", "syncStatus": "done" }
```

### Socket.IO — Eventos existentes (sem mudanca)

| Evento | Direcao | Uso |
|---|---|---|
| `message.received` | Server -> Client | Nova mensagem na conversa |
| `ai.thinking` | Server -> Client | Agente IA processando |
| `ai.responded` | Server -> Client | Agente IA respondeu |
| `lead.hot` | Server -> Client | Lead detectado como quente |
| `funnel.changed` | Server -> Client | Mudanca de etapa no funil |

### Protocolos e formatos

| Interface | Protocolo | Formato |
|---|---|---|
| Frontend <-> API | HTTPS REST | JSON (application/json) |
| Frontend <-> API (real-time) | Socket.IO sobre WSS | JSON events |
| API <-> Evolution API | HTTPS REST | JSON, header `apikey` |
| API <-> Redis | TCP (RESP protocol) | Strings, Lists, JSON serializado |
| Evolution API -> API (webhook) | HTTPS POST | JSON payload com `event` + `data` |

### Rate limiting

| Endpoint | Limite | Justificativa |
|---|---|---|
| `POST /onboarding/instance` | 3 req/hora por tenant | Evitar criacao descontrolada |
| `GET /onboarding/qr` | 20 req/min por tenant | QR expira a cada ~40s, polling a cada 3s |
| `POST /onboarding/sync` | 1 req/hora por tenant | Sync e pesado |
| `POST /webhook/evolution` | 200 req/s global | Capacidade de ingress para picos |

---

## 7. Consideracoes de Escalabilidade e Disponibilidade

### Estrategias de scaling

| Componente | Estrategia | Trigger |
|---|---|---|
| **NEXUS API** | Horizontal — multiplas replicas stateless | CPU > 70% ou p95 > 500ms |
| **Redis** | Vertical primeiro. Redis Cluster quando > 8GB | Memoria > 75% ou keyspace > 5M |
| **Evolution API** | Vertical — ~50MB RAM por instancia WhatsApp | 50 tenants = ~2.5GB |
| **Frontend** | CDN para assets estaticos | Trafego |

### Rate limiting e backpressure

| Ponto | Mecanismo |
|---|---|
| **Webhook ingress** | Throttler: 200 req/s. Excedente recebe 429, Evolution retenta |
| **SyncService** | Max 10 chats em paralelo. Timeout 5min |
| **Redis pipeline** | Batch de operacoes (ja implementado) |
| **Evolution API** | Cockatiel: retry 3x backoff, circuit breaker apos 5 falhas |

### Metas de disponibilidade

| Meta | Valor |
|---|---|
| **Uptime** | 99.5% (~3.6h downtime/mes) |
| **Perda de mensagens** | 0 (webhook retenta, Redis AOF) |
| **RTO** | < 5 min |
| **RPO** | < 10s |

### Cenarios de falha e recuperacao

| Cenario | Recuperacao |
|---|---|
| Redis reinicia | Auto-recovery. Cache reconstroi sob demanda |
| NEXUS API reinicia | Stateless. Socket.IO reconecta automaticamente |
| Evolution API reinicia | Sessoes reconectam (~30s). `connection.update` atualiza Redis |
| Sync falha no meio | `/retry-sync` retoma do checkpoint. Sync e idempotente |
| N8N fora do ar | Painel funciona. Agente IA para. Retoma quando N8N voltar |

---

## 8. Seguranca

### Autenticacao e autorizacao

| Camada | Mecanismo |
|---|---|
| **Login** | Magic link (email). Token UUID single-use, TTL 15min |
| **Sessao** | JWT access (15min) + refresh (30 dias). httpOnly cookies |
| **Refresh rotation** | Blacklist por JTI. Detecta reuso |
| **Autorizacao** | Role-based: admin / operator |
| **Isolamento** | JWT claim `instancia`. Imutavel. Endpoint extrai do JWT |

**Matriz de permissoes:**

| Endpoint | admin | operator |
|---|---|---|
| `GET /onboarding/state` | Sim | Sim |
| `POST /onboarding/instance` | Sim | Nao |
| `GET /onboarding/qr` | Sim | Nao |
| `POST /onboarding/sync` | Sim | Nao |
| `GET /conversations` | Sim | Sim |
| `POST /conversations/:jid/send` | Sim | Sim |

### Protecao do webhook

| Medida | Prioridade |
|---|---|
| Validacao de header `apikey` | P0 |
| Rate limiting 200 req/s | Ja existe |
| Payload validation | Ja existe |
| IP allowlist (Evolution server) | P1 |

### Criptografia

| Canal | Protocolo |
|---|---|
| Browser <-> API | HTTPS (TLS 1.3) |
| Browser <-> Socket.IO | WSS |
| API <-> Evolution API | HTTPS |
| API <-> Redis | TCP (mesmo host). TLS quando separar |

### PII

| Dado | Tratamento |
|---|---|
| Telefone | Mascarado no frontend (`PhoneMask.mask()`). Claro no Redis (necessario) |
| Nome do contato | Visivel apenas ao tenant dono |
| Mensagens | Visivel apenas ao tenant dono. Sem indexacao full-text |
| Email | Auth e auditoria apenas |

**Politica de exclusao:** Endpoint admin `DELETE /admin/tenants/:instancia/data` remove todas as chaves Redis do tenant.

---

## 9. Observabilidade

### Logs estruturados (nestjs-pino)

| Evento | Level | Contexto |
|---|---|---|
| `onboarding.instance-created` | INFO | OnboardingService |
| `onboarding.qr-generated` | INFO | OnboardingService |
| `onboarding.connection-open` | INFO | WebhookService |
| `onboarding.connection-close` | WARN | WebhookService |
| `sync.started` | INFO | SyncService |
| `sync.progress` | DEBUG | SyncService |
| `sync.completed` | INFO | SyncService |
| `sync.failed` | ERROR | SyncService |
| `cache.invalidated` | DEBUG | WebhookService |
| `cache.hit` / `cache.miss` | DEBUG | ConversationService |
| `evolution.request-failed` | WARN | EvolutionClient |
| `evolution.circuit-open` | ERROR | EvolutionClient |

### Metricas Prometheus (prom-client)

| Metrica | Tipo | Finalidade |
|---|---|---|
| `nexus_active_tenants` | Gauge | Tenants com connectionState=open |
| `nexus_sync_duration_seconds` | Histogram | Tempo do sync por tenant |
| `nexus_cache_hits_total` | Counter | Efetividade do cache |
| `nexus_cache_misses_total` | Counter | Cache misses |
| `nexus_webhook_events_total` | Counter | Volume por event_type |
| `nexus_webhook_latency_seconds` | Histogram | Tempo de processamento webhook |
| `nexus_evolution_errors_total` | Counter | Erros na Evolution API |

### Alertas

| Alerta | Condicao | Severidade |
|---|---|---|
| Tenant desconectou | connectionState open -> close | WARNING |
| Sync falhou | syncStatus = error > 5min | ERROR |
| Evolution fora | errors > 10 em 1min | CRITICAL |
| Cache ratio baixo | hit ratio < 70% por 15min | WARNING |
| Redis memoria alta | RSS > 75% | WARNING |

### SLIs/SLOs

| SLI | SLO |
|---|---|
| Disponibilidade do painel | 99.5% |
| Latencia lista conversas (p95) | < 300ms |
| Latencia webhook (p95) | < 100ms |
| Tempo sync inicial (p95) | < 120s |
| Taxa entrega mensagens | 99.9% |

---

## 10. Riscos Arquiteturais e Mitigacao

| # | Risco | Prob. | Impacto | Mitigacao |
|---|---|---|---|---|
| R1 | Evolution API fora do ar | Media | Critico | Circuit breaker (cockatiel). Painel funciona para leitura. Alerta Grafana |
| R2 | Sync timeout (>1000 chats) | Alta | Alto | Chunking 10 chats paralelos. Limite 200 msgs/chat. Timeout 5min. Checkpoint + retry |
| R3 | Redis sem persistencia | Media | Critico | AOF everysec + RDB snapshots. RPO < 10s |
| R4 | Webhook flood | Baixa | Alto | Throttler 200 req/s. Processamento leve. Evolution retenta no 429 |
| R5 | Race condition sync vs webhook | Media | Medio | RPUSH (append), SETNX (no overwrite). Webhook tem prioridade |
| R6 | Tenant orfao | Baixa | Medio | Job futuro de reconciliacao. Cleanup admin |
| R7 | QR expira sem refresh | Media | Baixo | Polling 30s no frontend. Auto-regeneracao |
| R8 | N8N config nao escala | Alta | Alto | Manual ate 50 tenants. Template clonavel medio prazo. API N8N longo prazo |

---

## 11. ADRs Associados e Proximos Passos

### Decisoes registradas

| ADR | Decisao | Justificativa |
|---|---|---|
| ADR-001 | Redis como unica store | Alinhamento com N8N, simplicidade, 50 tenants < 500MB |
| ADR-002 | Cache-aside com TTL por camada | Consistencia entre replicas. Hit ratio >90% |
| ADR-003 | Sync sincrono com chunking | Simplicidade. Fallback BullMQ se >5min |
| ADR-004 | Polling para QR code | WebSocket reservado para conversas. QR e baixa frequencia |
| ADR-005 | Instancia criada automaticamente | Onboarding self-service |
| ADR-006 | Webhook protegido por apikey | Custo zero. Bloqueia requests nao autorizados |
| ADR-007 | N8N config manual por tenant | Suficiente ate 50 tenants |

### Decisoes pendentes

| Decisao | Criterio | Quando |
|---|---|---|
| Migrar sync para BullMQ? | Se sync p95 > 120s | Apos 10 tenants |
| Redis Cluster vs vertical? | Se keyspace > 5M ou RAM > 8GB | Apos 30 tenants |
| Automatizar flows N8N? | Se onboarding manual > 10min/cliente | Apos 20 tenants |
| Adicionar Postgres? | Se precisar queries complexas | Quando produto pedir analytics |
| TLS no Redis? | Quando Redis for para host separado | Antes de separar infra |

### Proximos passos

| Passo | Descricao | Depende de |
|---|---|---|
| 1 | Plano de implementacao (skill writing-plans) | Spec aprovada |
| 2 | Implementar OnboardingModule (backend) | Plano |
| 3 | Estender WebhookService (connection.update + cache invalidation) | Passo 2 |
| 4 | Estender shared types (TenantEntry, RedisKeys) | Passo 2 |
| 5 | Implementar cache layer | Passo 3 |
| 6 | Implementar /connect page (frontend) | Passo 2 |
| 7 | Implementar ConnectionGuard (frontend) | Passo 6 |
| 8 | Testes de integracao | Passos 2-7 |
| 9 | Deploy staging | Passo 8 |
