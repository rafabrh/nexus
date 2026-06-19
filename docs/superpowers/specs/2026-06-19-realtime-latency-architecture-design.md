# NEXUS Realtime & Latency Architecture

**Date:** 2026-06-19
**Status:** Approved (design)
**Author:** Rafa (SHK GROUP.IA) + Claude
**Related:** [2026-05-19-nexus-saas-architecture-design.md](./2026-05-19-nexus-saas-architecture-design.md) §3.3

## 1. Problem Statement

O painel NEXUS deveria atualizar em tempo real conforme o cliente interage no
WhatsApp (mensagem nova, IA respondendo, funil avançando, pagamento). Na
prática, o teste local mostrou que isso não funciona:

- **Conversas não carregam todas** — a lista só inclui JIDs que tenham a chave
  exata `chat:{inst}:{jid}:followup_step`, e faz `SCAN` global do Redis
  compartilhado a cada request.
- **Mensagem enviada pelo operador não aparece** — `sendMessage` só chama a
  Evolution API; nada é gravado no histórico que o painel lê, e nenhum evento é
  publicado.
- **Kanban não preenche nem se move sozinho** — depende de eventos que só
  existem se o Redis tiver `notify-keyspace-events` ligado (não configurado em
  lugar nenhum) e da mesma descoberta frágil por `followup_step`.

A spec mãe (§3.3) tratava o realtime como fato resolvido ("Socket.IO push →
atualiza real-time") sem especificar transporte, descoberta, payloads,
resiliência ou escala. Este documento define essa camada com três metas
explícitas: **baixa latência, resiliência e escalabilidade**.

## 2. Decisions

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Fonte dos eventos | **Painel passivo via keyspace** (N8N intocado) | N8N é sagrado e por-cliente; evitar custo operacional e risco no fluxo |
| Config do keyspace | **API auto-configura no boot** (`CONFIG SET ... KEA`) | Nenhum Redis novo quebra o realtime silenciosamente |
| Descoberta de conversas | **Índice por tenant** (`conversas:{inst}` SET) | Resolve "não carrega todas" + tira o `SCAN` global do caminho quente |
| Escala do Socket.IO | **Redis adapter agora** | Habilita N réplicas sem mudança posterior; objetivo de escalabilidade |
| Latência dos eventos | **Eventos enriquecidos** (payload com valor) | Patch direto no cache do cliente em vez de invalidar/reconstruir tudo |
| Consistência no pior caso | **Polling de segurança + reconcile no reconnect** | Keyspace pub/sub é perdível; garante convergência eventual |

## 3. Architecture Overview

### 3.1 Data Flow (revisado)

```
Cliente manda WhatsApp → N8N processa → RPUSH chathistory:{inst}-{phone}
   → keyspace rpush → translator → message.received {instancia, jid}
   → publisher: emit p/ room tenant:{inst} (cross-réplica via adapter)
                + XADD events:{inst} (replay)
   → listener: SADD conversas:{inst} (auto-cura do índice)
   → front: invalidate ['messages', jid] + atualização leve da lista

N8N avança funil → SET chat:{inst}:{jid}:followup_step S3
   → keyspace set → translator GET valor → funnel.changed {jid, stage:'S3'}
   → front: patch cache de ['leads']/['conversations'] → card move (sem refetch)

Operador envia pelo painel → POST /send
   → evolution.sendText + RPUSH chathistory + SET humanControlUntil + SADD índice
   → front: append otimista em ['messages', jid]; keyspace confirma
```

### 3.2 Princípios

1. O painel **observa as chaves que carregam significado real**, não proxies
   efêmeros (`buffer`).
2. A descoberta de conversas é **O(n do tenant)**, nunca O(keyspace global).
3. Eventos de **mudança de valor** carregam o valor → o cliente faz patch local.
4. O caminho feliz é instantâneo; o pior caso converge por **poll de segurança**.
5. Toda a camada é **multi-réplica desde já** (Redis adapter).

## 4. Components

### 4.1 KeyspaceConfigService (resiliência do transporte)

Novo serviço `OnApplicationBootstrap`:

1. `CONFIG SET notify-keyspace-events KEA` (idempotente).
2. `CONFIG GET notify-keyspace-events` para confirmar que contém `K` + as
   classes necessárias.
3. Se falhar (ex.: Redis gerenciado bloqueando `CONFIG`): loga `ERROR` e marca o
   realtime como `degraded` no healthcheck. **Não derruba a app** — o painel cai
   no poll de segurança (§4.6).

Sem isso, toda a camada passiva fica silenciosa — é a causa raiz #1 do Kanban
parado.

### 4.2 KeyspaceListener (alvos corrigidos)

Os padrões observados passam a mirar as chaves de dado real:

| Padrão | Operação | Evento |
|--------|----------|--------|
| `__keyspace@{db}__:chathistory:*` | `rpush` | `message.received` |
| `__keyspace@{db}__:chat:*:processing` | `set` / `del`/`expired` | `ai.thinking` / `ai.responded` |
| `__keyspace@{db}__:chat:*:followup_step` | `set` | `funnel.changed` |
| `__keyspace@{db}__:chat:*:humanControlUntil` | `set` / `del`/`expired` | `ai.toggled` |
| `__keyspace@{db}__:chat:*:paymentStatus` | `set` | `payment.approved` |

- `chathistory:*` no `rpush` captura **tanto a mensagem do cliente quanto a
  resposta da IA**, exatamente quando o histórico exibido muda. Substitui o
  proxy frágil `buffer`.
- `{db}` deixa de ser fixo em `@0`: vem do índice de DB da conexão Redis.
- No `rpush` de `chathistory`, o listener também faz `SADD conversas:{inst}`
  (auto-cura do índice).
- Resubscribe automático no `reconnect` da conexão duplicada.

### 4.3 EventTranslator (branch novo + enriquecimento)

- Novo branch para `chathistory:{inst}-{phone}` (formato com hífen) que deriva o
  `jid` canônico — legacy `{phone}@s.whatsapp.net` ou `{lid}@lid` — reusando a
  lógica de `resolvePersonalJid` (`apps/api/src/core/whatsapp/jid.util.ts`).
- Para eventos de mudança de valor, faz **um `GET`** da chave e inclui o valor:
  - `funnel.changed` → `{ jid, stage }`
  - `ai.toggled` → `{ jid, state }`
- `message.received` continua sem conteúdo no payload (refetch).

### 4.4 Índice de conversas por tenant

- Nova chave `conversas:{inst}` (Redis SET) com os JIDs canônicos.
- Mantido por: **webhook** (`messages.upsert`/contatos), **sync** (import),
  **listener** (`rpush` de `chathistory`), **send/stage** do operador — todos
  `SADD`.
- `ConversationRepository.findAllJids` passa a ler o SET (sem `SCAN` global).
- **Backfill único** no boot: se o SET estiver vazio, varre os
  `chathistory:{inst}-*` + `chat:{inst}:*:followup_step` existentes e popula
  (idempotente).

### 4.5 Persistência da mensagem do operador

`ConversationService.sendMessage`, após `evolution.sendTextMessage` OK:

1. `RPUSH chathistory:{inst}-{phone}` com a mensagem no shape LangChain
   (`{type:'ai', data:{content, timestamp}}`) → persiste e dispara
   `message.received`.
2. `SET chat:{inst}:{jid}:humanControlUntil` → pausa a IA (torna verdadeiro o
   aviso já presente na UI).
3. `SADD conversas:{inst}`.

Frontend: `useSendMessage` ganha **append otimista** em `['messages', jid]`,
reconciliado pelo refetch/evento.

### 4.6 Socket.IO Redis adapter + resiliência do bridge

- `@socket.io/redis-adapter` em dois clients ioredis duplicados (pub/sub) → os
  broadcasts cruzam réplicas.
- **Reconcile no (re)connect**: além do `replay` já existente, o `connect`
  invalida `['conversations']`/`['leads']` para cobrir eventos perdidos durante
  queda total.
- **Poll de segurança em baixa frequência**: `conversations`/`leads` com
  `refetchInterval` ~30–60s (`messages` já em 10s). Keyspace dá o instantâneo; o
  poll garante consistência eventual se um evento se perder.

### 4.7 Invalidação escopada (frontend)

`EVENT_TO_QUERY_KEYS` corrigido para não invalidar chaves erradas/largas:

- `message.received` / `ai.responded` → `['messages', jid]` + atualização leve
  da lista (corrige o bug atual onde `message.received` nunca tocava o detalhe
  da conversa).
- `funnel.changed` / `ai.toggled` → **patch direto** no cache via valor do
  payload, sem refetch.

## 5. Error Handling

| Cenário | Comportamento |
|---------|---------------|
| `CONFIG SET` falha (Redis gerenciado) | Log `ERROR`, healthcheck `degraded`, realtime cai no poll de segurança |
| Conexão keyspace cai | Resubscribe no `reconnect`; clientes reconciliam no `connect` |
| Translator não consegue parsear | Skip + `warn` (comportamento atual mantido) |
| Drift do índice | Backfill idempotente + `SADD` do listener auto-curam |
| API fora no instante da escrita | Evento se perde no bridge; convergência via poll/reconcile |

## 6. Testing

**Unit (vitest):**
- `EventTranslator`: branch `chathistory:{inst}-{phone}` → jid (legacy + LID);
  enriquecimento de `funnel.changed`/`ai.toggled` com valor (mock GET).
- `KeyspaceConfigService`: `CONFIG SET ... KEA` + validação; caminho de falha
  loga ERROR sem lançar.
- Índice: `SADD` em send/sync/webhook/listener; `findAllJids` lê o SET; backfill
  idempotente.
- `sendMessage`: `RPUSH` no histórico, `SET humanControlUntil`, `SADD` no índice.

**Integração (Redis real/embutido com `notify-keyspace-events`):**
- `rpush` em `chathistory` → `message.received` no publisher.
- `SET followup_step S3` → `funnel.changed` com `stage:'S3'`.

**Frontend:**
- `useSendMessage` append otimista + reconcile.
- Invalidação escopada: `message.received` atinge `['messages', jid]`.

## 7. Out of Scope (YAGNI)

- Qualquer mudança no fluxo N8N (decisão: passivo).
- Migração para Postgres / histórico longo.
- Read receipts / presença em tempo real.
- Sticky sessions no proxy (Redis adapter cobre cross-réplica; endereçar só se o
  handshake com polling der problema).
- Patch de cache para `message.received` (conteúdo novo sempre refetch).
