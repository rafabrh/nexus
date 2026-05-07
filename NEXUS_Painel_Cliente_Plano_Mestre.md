# NEXUS — Painel do Cliente

**Plano Mestre de Construção · v1.0**
**Autor:** Rafa · SHK GROUP.IA
**Última atualização:** 2026-05-01
**Status:** Aprovado para execução · Big push 7-8 semanas · Solo
**Stack base:** Next.js 14 + Spring Boot 3 + Redis (Postgres adiado)

---

## Sumário

1. [Sumário executivo](#1-sumário-executivo)
2. [Visão e premissas](#2-visão-e-premissas)
3. [Arquitetura final](#3-arquitetura-final)
4. *Stack e setup local* — turno 2
5. *Contrato de API (OpenAPI 3.1)* — turno 2
6. *Modelo de dados* — turno 2
7. *Roadmap de execução (8 semanas)* — turno 3
8. *Catálogo de tasks atômicas* — turno 3
9. *Threat model + LGPD* — turno 4
10. *Operações e observabilidade* — turno 4
11. *Apêndices (ADRs, prompts, troubleshooting)* — turno 4

---

## 1. Sumário executivo

### O que está sendo construído

Um painel web que dá ao **cliente final da SHK GROUP.IA** controle visual do agente NEXUS que roda no WhatsApp. O cliente loga em `sub.shkgroups.com`, vê suas conversas em tempo real, liga ou desliga a IA com um botão, edita notas, acompanha o funil de vendas, e visualiza receita do dia.

O painel **não substitui o N8N** — ele expõe o estado que o N8N já mantém no Redis e no Google Sheets, e oferece uma camada de comando que escreve nas mesmas chaves que os comandos administrativos do WhatsApp já usam hoje.

### Por que isso vende mais

Hoje, quando você fecha um contrato de Agente IA, o cliente **acredita** que a automação está funcionando — ele vê leads chegando, vê pagamentos acontecendo, mas não vê o NEXUS *trabalhando*. O painel transforma essa fé em evidência:

- O cliente vê a mensagem do lead chegar em tempo real
- Vê o NEXUS digitando antes de responder
- Vê o badge "gatilho S6 detectado · preço" piscar quando o agente identifica intenção de compra
- Recebe confete na tela quando o pagamento aprova
- Pode pausar a IA com um clique se quiser assumir pessoalmente

Isso não é melhoria incremental de UX — é a **diferença entre commodity e premium**. Concorrentes vendem "automação no WhatsApp". Você vai vender "veja sua automação acontecendo".

### Restrições aceitas

| Prioridade | Restrição | Implicação no plano |
|---|---|---|
| 1 | Não pode quebrar o N8N em produção | Zero modificação no workflow atual. BFF lê Redis via Keyspace Notifications. Rollback = desligar o BFF. |
| 2 | Precisa parecer premium | Investimento pesado em UX/animação. Identidade visual no Sprint 6. |
| 3 | Custo de infra perto de zero | Stack: 1 container Docker no VPS atual + Vercel free + Resend free. R$ 0 incrementais. |
| 4 | Tempo: 7-8 semanas | Big push solo. Sem desvio. |

### Decisões arquiteturais já tomadas

- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui + Socket.IO client
- **BFF:** Spring Boot 3 + Java 17 + Spring WebSocket STOMP + JWT + magic link
- **Estado quente:** Redis (já existe) + Keyspace Notifications + Streams
- **Histórico/CRM:** Google Sheets (já existe) com cache de 30s no BFF
- **Postgres:** **adiado** — entra quando dor real aparecer (provável Sprint 4-5 do v2)
- **Realtime:** WebSocket STOMP, **não** gRPC, **não** SSE puro
- **Multi-tenant:** light, ancorado em `instancia` em todas as queries
- **Deploy:** subdomínio `sub.shkgroups.com`, container junto ao N8N existente

### O que será entregue ao final

| Artefato | Descrição |
|---|---|
| Frontend `nexus-panel-web` | Next.js deployado em Vercel, conectado ao BFF |
| BFF `nexus-panel-api` | Container Docker rodando no VPS, exposto em `api.shkgroups.com` |
| 3 telas funcionais | Conversas (theater), Funil, Dashboard |
| Mini-CRM lateral | Toggle IA, notas, tags, etapa, ações |
| Onboarding manual | 3 minutos para adicionar novo cliente (admin SHK) |
| Documentação | README, ADRs, OpenAPI publicada, runbook de operação |

### Orçamento de risco

Em qualquer projeto solo de 7-8 semanas, o que mata o cronograma não é estimativa errada — é **frente paralela inesperada**. Riscos identificados, ranqueados:

1. **Cliente atual exigir feature nova no N8N (40% prob.)** → contingência: postergar 1 semana, sem comprometer o painel
2. **Bug em produção do NEXUS V6 (30% prob.)** → contingência: pausar painel até resolver
3. **Sheets API quebrar/limitar (20% prob.)** → contingência: cache mais agressivo + Postgres antecipado
4. **Você ficar doente ou viajar (15% prob.)** → contingência: buffer de 1 semana embutido (semana 8)
5. **Cliente piloto pedir scope-creep (60% prob.)** → contingência: dizer "v2" para tudo

---

## 2. Visão e premissas

### 2.1 Hipótese de valor (a frase que justifica o projeto)

> "Quando o cliente da SHK vê o NEXUS trabalhando em tempo real, ele paga mais, fica mais tempo, e indica para outros. O painel é o que transforma 'serviço' em 'produto'."

Esta hipótese é **falsificável** e deve ser testada após Sprint 3 com 1-2 clientes piloto. Se não houver mudança em LTV, NPS ou indicações em 30 dias, é sinal de que o painel não está movendo a agulha de venda — e o roadmap precisa ser repensado.

### 2.2 Personas

| Persona | Quem é | Frequência de uso | Ações típicas |
|---|---|---|---|
| **Cliente operador** | Dono ou atendente do negócio que contratou o Agente IA | 5-10x/dia | Ver conversas, pausar IA quando assumir, ler notas |
| **Cliente vitrine** | Dono que delega operação mas quer "ver funcionando" | 1-2x/dia | Abrir dashboard, ver receita do dia, conferir leads quentes |
| **Admin SHK (você)** | Operador da plataforma SHK | Diariamente | Onboarding de novos clientes, suporte, troubleshooting |

O painel é projetado primariamente para **Cliente operador**. Cliente vitrine usa o mesmo painel mas só toca Dashboard. Admin SHK usa as telas adicionais `/admin/tenants`.

### 2.3 Princípios de design (decisões que vão ser repetidas em cada tela)

1. **N8N é o dono da lógica.** O painel nunca duplica regras de funil ou decisões de handoff. Apenas lê estado e envia comandos.
2. **Realtime onde importa, polling onde basta.** Eventos do Redis chegam por WebSocket. Sheets é polled com cache.
3. **Idempotência obrigatória.** Todo comando do painel carrega `clientRequestId`. BFF deduplica antes de tocar Redis.
4. **LGPD by default.** Telefone mascarado, click-to-reveal logado, optout respeitado em toda leitura.
5. **Premium é polimento, não feature.** Animações sutis, microcopy cuidadosa, vazios bonitos.
6. **Mobile-first nas conversas.** Operador no celular precisa toggle IA + responder rápido.
7. **Feature flags desde o dia 1.** Cada widget novo entra atrás de flag. Deploy nunca é assustador.
8. **Boring is beautiful.** REST, JWT, Redis, container Docker. Nada de tecnologia para portfólio neste projeto.

### 2.4 Definição de pronto (DoD) por nível

**Por task (commit individual):**
- Compila sem warnings
- Testes unitários onde aplicável passam
- Linter passa
- Branch protection respeitada (PR para `main`)

**Por sprint (release):**
- Todas as tasks da sprint passam DoD individual
- Smoke test manual rodado e gravado em vídeo de 30s
- Deploy em staging executado
- Changelog atualizado
- Tags `v0.X.0` criadas

**Por release pública:**
- Telemetria respondendo (Actuator + logs estruturados)
- Threat model revisado para o que mudou
- Documentação operacional atualizada
- Cliente piloto avisado

### 2.5 Premissas técnicas confirmadas

- **Redis atual** roda no mesmo VPS do N8N, versão ≥ 6.0 (suporta Streams e Keyspace Notifications)
- **Sheets API** com Service Account já configurado (mesmo do N8N pode ser reutilizado ou novo)
- **Evolution API** acessível e estável (latência típica < 500ms)
- **DNS shkgroups.com** sob seu controle para criar subdomínios
- **VPS** com pelo menos 1GB RAM livre para o container BFF (Spring Boot tipicamente usa 300-500MB)
- **Vercel account** existente ou possível de criar (free tier suficiente)
- **Domínio para email transacional**: `noreply@shkgroups.com` configurável (SPF/DKIM via Resend)

### 2.6 Não-objetivos (escopo explicitamente fora)

Tão importante quanto o que está dentro é o que está fora:

- ❌ Self-service de onboarding (cliente cria conta sozinho)
- ❌ Billing integrado (cobrança fica fora do painel)
- ❌ Múltiplas instâncias Evolution por cliente
- ❌ Editor visual de fluxo do agente (cliente muda prompt do NEXUS pelo painel)
- ❌ Inbox compartilhada entre múltiplos operadores do mesmo cliente
- ❌ Mobile app nativo (PWA basta)
- ❌ Suporte a Instagram (NEXUS atual só WhatsApp)
- ❌ Dashboard com BI complexo (gráficos avançados, drill-down, filtros multidimensionais)
- ❌ Integração com outras ferramentas (Slack, Notion, Pipedrive, Salesforce)
- ❌ Internacionalização (interface só em PT-BR)

Tudo isso fica para v2 ou descartado conforme dor real aparecer.

---

## 3. Arquitetura final

### 3.1 Visão de containers (C4 nível 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cliente final (browser)                       │
│              sub.shkgroups.com · Next.js 14 PWA                  │
└──────────────────┬──────────────────────────┬───────────────────┘
                   │ HTTPS REST               │ WSS STOMP
                   │                          │
                   ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              BFF Spring Boot 3 · api.shkgroups.com               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Auth     │ │ REST     │ │ STOMP    │ │ Cache TTL 30s    │  │
│  │ JWT+Magic│ │ Controll.│ │ broker   │ │ (Caffeine)       │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │       Redis Keyspace Listener (Spring Data Redis)         │  │
│  │       Streams Reader (XREAD/XADD)                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────┬──────────────────────┬──────────────────────┬─────────────┘
     │ TCP 6379             │ HTTPS                │ HTTPS
     │                      │                      │
     ▼                      ▼                      ▼
┌──────────┐         ┌──────────────┐      ┌──────────────┐
│  Redis   │◄────────│Google Sheets │      │Evolution API │
│ (existe) │ escrita │ (existe)     │      │ (existe)     │
│          │         │              │      │              │
│ Notify:  │         │ CRM Leads    │      │ Send msg     │
│ KEA      │         │ Notas        │      │ etc.         │
└────▲─────┘         └──────────────┘      └──────────────┘
     │ escrita
     │
┌────┴─────────────────────────────────────────────────────────────┐
│                      N8N V6.0 (intocado)                         │
│              182 nós · workflow em produção · zero mudança       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Princípios de fluxo de dados

**Leituras** seguem ordem de preferência:

1. WebSocket (push em tempo real via Keyspace Notifications)
2. Cache local Caffeine (TTL 30s para Sheets, 5s para Redis)
3. Redis direto (TCP, < 5ms)
4. Sheets API (com retry exponencial + cache)

**Escritas** seguem o caminho mais curto:

1. Toggle IA → BFF escreve direto no Redis (chave que N8N já lê)
2. Enviar como NEXUS → BFF chama Evolution API direto (mesma credencial do N8N)
3. Notas → BFF escreve Redis + enfileira Sheets sync (best-effort)
4. Tags → BFF escreve Redis (Sheets é eventual)

**Eventos do N8N para o painel** chegam por **caminho indireto**:

```
N8N escreve no Redis  →  Redis emite Keyspace Notification  →
BFF assina pattern    →  BFF traduz para evento de domínio  →
BFF persiste em       →  BFF publica em /topic/tenant/{inst}/events
   Redis Stream
                         └→  Frontend recebe via WebSocket
```

Esse mecanismo é a **chave** para realtime sem mexer no N8N. Sem isso, sobraria polling — que funciona, mas mata o "wow" da experiência.

### 3.3 Arquitetura interna do BFF (C4 nível 3)

```
┌────────────────────────────────────────────────────────────────┐
│                     Spring Boot Application                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Layer: Controllers (REST + STOMP)                       │   │
│  │ - ConversationController, AuthController, TenantCtrl    │   │
│  │ - StompConfig (broker /topic, /queue)                   │   │
│  └─────────────────────┬──────────────────────────────────┘   │
│                        ▼                                       │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Layer: Services (regras de aplicação)                   │   │
│  │ - ConversationService, NotesService, AIControlService   │   │
│  │ - EventTranslationService (Keyspace → DomainEvent)      │   │
│  └─────────────────────┬──────────────────────────────────┘   │
│                        ▼                                       │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Layer: Repositories (abstração de fonte de dados)       │   │
│  │ - ConversationRepo (Redis), LeadRepo (Sheets+cache)     │   │
│  │ - Interface única; Postgres entra trocando impl         │   │
│  └─────────────────────┬──────────────────────────────────┘   │
│                        ▼                                       │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Layer: Clients (gateways de I/O)                        │   │
│  │ - RedisClient, SheetsClient, EvolutionClient            │   │
│  │ - Resilience4j: retry, circuit breaker, bulkhead        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Cross-cutting:                                                │
│  - Security: JwtAuthFilter, TenantFilter (RLS por instancia)  │
│  - Observability: Actuator, Micrometer, structured logs       │
│  - Idempotency: ClientRequestIdInterceptor                    │
└────────────────────────────────────────────────────────────────┘
```

A separação **Repository** é o seguro contra Postgres. Quando você decidir migrar histórico ou métricas para Postgres, troca a implementação do `LeadRepository` sem tocar em service ou controller. Mesma interface, fonte diferente.

### 3.4 Mecanismo de realtime (a peça crítica)

Esta seção é técnica e merece atenção. É o que viabiliza Cenário B sem mexer no N8N.

**Configuração Redis** (executado uma vez):

```bash
redis-cli CONFIG SET notify-keyspace-events "KEA"
redis-cli CONFIG REWRITE
```

`KEA` significa: notifica eventos de chaves (K), aliases para todos eventos (E), e tipo string (A). Isso faz com que toda escrita no Redis dispare uma mensagem em canais como `__keyspace@0__:chat:Shkgroup:5511...:humanControlUntil`.

**BFF assinatura** (Spring Data Redis):

```
@Component
public class KeyspaceListener {

    @EventListener
    public void onKeyExpired(RedisKeyExpiredEvent ev) { ... }

    // Ouvinte por padrão glob
    public void subscribe() {
        listenerContainer.addMessageListener(
            (msg, pattern) -> translate(msg),
            new PatternTopic("__keyspace@0__:chat:*:humanControlUntil")
        );
    }
}
```

**Tradução de notificação Redis → evento de domínio:**

| Notificação Redis | Evento de domínio | Canal STOMP |
|---|---|---|
| `__keyspace@0__:chat:{inst}:{jid}:humanControlUntil` SET | `ai.toggled` | `/topic/tenant/{inst}/events` |
| `__keyspace@0__:chat:{inst}:{jid}:humanControlUntil` DEL/EXPIRE | `ai.toggled` (state=ON) | `/topic/tenant/{inst}/events` |
| `__keyspace@0__:chat:{inst}:{jid}:processing` SET | `ai.thinking` | `/topic/tenant/{inst}/conversation/{jid}` |
| `__keyspace@0__:chat:{inst}:{jid}:buffer` LPUSH | `message.received` | `/topic/tenant/{inst}/events` |
| `__keyspace@0__:mp:payment:*:approvedSent` SET | `payment.approved` | `/topic/tenant/{inst}/events` |
| `__keyspace@0__:chat:{inst}:{jid}:paymentStatus` SET (paid) | `payment.approved` | `/topic/tenant/{inst}/events` |

**Para o que falta** (resposta do NEXUS, que vai direto da Evolution para o lead, sem passar pelo Redis em escrita observável):

Polling do `Redis Chat Memory` do LangChain a cada 2 segundos, **somente para conversas com aba aberta no browser**. Page Visibility API garante que o polling para quando o usuário troca de aba.

```
Em conversa aberta:  poll a cada 2s (custo: 1 GET / conversa / 2s)
Aba escondida:       polling pausado
50 conversas abertas: pico de 25 GETs/s → desprezível para Redis
```

**Replay no reconnect:**

Cada evento traduzido vai também para um **Redis Stream** capped em 1000 entradas:

```
XADD events:Shkgroup MAXLEN 1000 * type ai.toggled jid 5511... ts 17463...
```

Quando o frontend reconecta, ele envia o último `eventId` que conhece, e o BFF replaya tudo desde então via `XRANGE`. Zero buracos durante reconexão.

### 3.5 Multi-tenant light: o ancoramento em `instancia`

Toda query do BFF é prefixada por `instancia`. **Toda.** Sem exceção.

```
JWT do usuário → contém claim "instancia": "Shkgroup"
                 ↓
TenantFilter (Servlet) → injeta TenantContext.set("Shkgroup")
                 ↓
Repository.findConversations() → SCAN MATCH chat:Shkgroup:*
                 ↓
Resultado: cliente só vê chaves do próprio tenant
```

Operador SHK (você) tem claim adicional `"role": "admin"` que permite bypass do filtro e acesso a `/admin/tenants/*`. Esse bypass é **explícito** — nunca implícito por convenção.

**Tabela de tenants** mantida como JSON no Redis (ou arquivo no resources do BFF para começar):

```json
{
  "tenants": [
    {
      "instancia": "Shkgroup",
      "name": "SHK Group",
      "users": ["rafa@shkgroups.com"],
      "role": "admin"
    },
    {
      "instancia": "ClientA",
      "name": "Cliente A",
      "users": ["dono@clientea.com"]
    }
  ]
}
```

Onboarding de cliente novo:

```
1. POST /api/v1/admin/tenants {instancia, name}
2. POST /api/v1/admin/tenants/{instancia}/users {email}
3. Cliente recebe magic link no email
4. Clica → cria sessão → vê só o seu
```

### 3.6 Segurança em camadas (defense in depth)

```
Camada 1: TLS                  Cloudflare ou Caddy reverse proxy
Camada 2: CORS                 Origin whitelist: sub.shkgroups.com
Camada 3: Auth                 JWT (15min TTL) + refresh (7 dias)
Camada 4: Authorization        TenantFilter + RoleFilter
Camada 5: Rate limit           Bucket4j por IP + por tenant
Camada 6: Audit log            Toda escrita logada estruturado
Camada 7: Secrets              Vault ou .env não commitado; rotação trimestral
Camada 8: PII masking          Telefone mascarado por padrão; reveal logado
```

### 3.7 Falhas e degradação graciosa

O sistema é projetado para que **a queda do BFF não afete o NEXUS**. Cliente vê painel offline; NEXUS continua atendendo no WhatsApp.

| Componente cai | Impacto no painel | Impacto no NEXUS | Recuperação |
|---|---|---|---|
| BFF | Painel offline | Nenhum | Restart container (auto-healing Docker) |
| Redis | Painel sem realtime + sem comandos | NEXUS quebra também (já dependia) | Recuperar Redis recupera ambos |
| Sheets | Painel sem CRM histórico (cache 30s sobrevive) | NEXUS perde upsert, mas envia mensagens | Sheets volta = cache repopula |
| Evolution | Painel não envia "como NEXUS" | NEXUS para de receber/enviar | Não é problema do painel |
| Postgres | (não existe ainda) | — | — |

**A decisão arquitetural mais importante:** o painel é uma **camada de leitura e comando opcional**. Em hipótese alguma o NEXUS deve depender dele para funcionar.

### 3.8 Tabela mestra de chaves Redis (a "API de leitura" oficial)

Esta é a tabela mais importante do documento. Toda a lógica do BFF lê e escreve **apenas** destas chaves. Mudanças aqui são changelog do contrato.

| Chave | Tipo | Owner (escreve) | BFF lê | BFF escreve | Notify |
|---|---|---|---|---|---|
| `chat:{inst}:{jid}:humanControlUntil` | string (epoch ms) | N8N + BFF | sim | sim | sim |
| `chat:{inst}:{jid}:paymentStatus` | string | N8N | sim | não | sim |
| `chat:{inst}:{jid}:optout` | string | N8N + BFF | sim | sim | não |
| `chat:{inst}:{jid}:followup_step` | string | N8N | sim | não | não |
| `chat:{inst}:{jid}:notas` | string (JSON) | N8N + BFF | sim | sim | não |
| `chat:{inst}:{jid}:tags` | string (JSON) | N8N + BFF | sim | sim | não |
| `chat:{inst}:{jid}:state` | string | N8N | sim | não | não |
| `chat:{inst}:{jid}:buffer` | list/string | N8N | não (proxy) | não | sim |
| `chat:{inst}:{jid}:processing` | string lock | N8N | não (proxy) | não | sim |
| `mp:payment:{id}:approvedSent` | string | N8N | sim | não | sim |
| `contact:{phone}` | string (JSON) | N8N | sim | não | não |
| `chathistory:*` | LangChain memory | N8N | sim (poll) | não | não |
| `events:{inst}` | Stream | BFF | sim | sim | — |
| `tenant:registry` | string (JSON) | BFF | sim | sim | não |
| `idempotency:{requestId}` | string | BFF | sim | sim | não |

**Política de propriedade:** se "Owner" inclui N8N, o BFF **nunca apaga** a chave (apenas atualiza valor quando autorizado). Isso evita race conditions onde o painel limpa estado que o N8N esperava encontrar.

---

## Próximo turno

O Turno 2 cobre:

- **Seção 4 — Stack e setup local:** comandos exatos do `git init` ao primeiro `localhost:3000` rodando, Docker Compose com Redis local, configuração de variáveis, scripts de seed
- **Seção 5 — Contrato de API (OpenAPI 3.1):** todos os endpoints REST e canais STOMP especificados, com schemas, códigos de erro e exemplos
- **Seção 6 — Modelo de dados:** schemas TypeScript do frontend, classes Java do BFF, tabela completa de eventos, formato de logs, formato de tokens

Diga **segue** quando quiser que eu gere o Turno 2.
