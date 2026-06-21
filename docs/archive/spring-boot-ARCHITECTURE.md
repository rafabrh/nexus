# NEXUS Panel API — Arquitetura

## Stack

| Tecnologia | Justificativa |
|---|---|
| **Spring Boot 3.3** | Ecossistema maduro para BFF com WebSocket STOMP, Redis, Security, Actuator — tudo integrado |
| **Java 17** | LTS estável, records para domain objects imutáveis, sealed interfaces para eventos tipados |
| **Lettuce (Redis)** | Client async/reativo para Redis, pool de conexões, suporte a Keyspace Notifications |
| **JJWT 0.12** | Biblioteca JWT padrão do ecossistema Java, API fluente, suporte a claims customizados |
| **Caffeine** | Cache local in-memory com TTL, evita roundtrips Redis/Sheets para dados que mudam pouco |
| **Resilience4j** | Circuit breaker + retry + rate limiter para proteger chamadas a Evolution API e Sheets |
| **Google Sheets API** | CRM de leads já existente no ecossistema N8N, leitura via Service Account |
| **Resend** | Email transacional para magic links, free tier suficiente |
| **SpringDoc OpenAPI** | Documentação automática da API REST, Swagger UI para debug |
| **Micrometer + Prometheus** | Métricas de aplicação expostas via Actuator para observabilidade |
| **Testcontainers + JUnit 5** | Testes de integração com Redis real em container Docker |

## Estrutura de pacotes

```
com.shk.nexus.api/
  NexusPanelApiApplication.java     # Entry point
  config/                           # Spring configs (Redis, WebSocket, Security, Cache, CORS, OpenAPI)
  security/                         # JWT auth (JwtService, JwtAuthFilter, TenantContext, STOMP interceptor)
  domain/                           # Records imutáveis (Conversation, Lead, NexusEvent, FunnelStage)
  dto/                              # Contratos REST — o que o frontend recebe/envia
  repository/                       # Abstração de dados (interface + impl Redis)
  client/                           # Gateways I/O (Evolution API, Sheets, Resend)
  events/                           # Pipeline realtime (Keyspace Listener → Translator → Publisher)
  service/                          # Lógica de aplicação (9 services)
  controller/                       # REST endpoints + STOMP controller
  exception/                        # Exceções de domínio + GlobalExceptionHandler (RFC 7807)
  util/                             # PhoneMaskUtil (LGPD), StructuredLogger
```

## Decisoes arquiteturais

1. **BFF como camada de leitura opcional.** O NEXUS (N8N) nunca depende do painel. Se o BFF cair, o agente continua atendendo no WhatsApp.

2. **Realtime via Keyspace Notifications.** Redis emite eventos quando o N8N escreve chaves. O BFF assina esses padrões, traduz para eventos de domínio, e publica via WebSocket STOMP. Zero modificação no N8N.

3. **Multi-tenant por `instancia`.** Toda query é prefixada pelo tenant. JWT carrega claim `instancia`. TenantContext (ThreadLocal) garante isolamento em cada request.

4. **Repository pattern com interface.** ConversationRepository é interface; RedisConversationRepository é a impl. Quando Postgres entrar, troca a impl sem tocar service/controller.

5. **Idempotência obrigatória.** Comandos do frontend carregam `clientRequestId`. BFF deduplica via Redis SET NX com TTL de 5min.

6. **LGPD by default.** Telefones mascarados em toda resposta. Reveal requer ação explícita (logada).

## Fluxo de dados

```
N8N escreve Redis → Keyspace Notification → KeyspaceEventListener
  → EventTranslator (chave Redis → NexusEvent) → EventPublisher
    → STOMP /topic/tenant/{inst}/events (frontend recebe)
    → Redis Stream events:{inst} (replay em reconexão)
```

## Variáveis de ambiente

Ver `.env.example` na raiz do módulo.
