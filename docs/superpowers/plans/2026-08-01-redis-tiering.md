# Tiering do Redis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manter só a cauda quente do `chathistory` no Redis (LTRIM) e arquivar o histórico completo no Postgres como projeção durável, com leitura tiered — destravando ~5M threads sem estourar a memória do Redis.

**Architecture:** O keyspace listener (`apps/api/src/realtime/keyspace.listener.ts`) já dispara em TODO `rpush` de `chathistory:*` (inclusive escrito pelo N8N). Enganchamos aí um **archiver write-behind** (idempotente por WAMID) que espelha a cauda no Postgres e depois faz `LTRIM` da lista para um teto quente. A leitura (`ConversationRepository`) passa a ler a cauda do Redis e, para páginas mais antigas, cai no Postgres. Um backfill único popula o histórico existente antes de ligar o LTRIM em produção (flag).

**Tech Stack:** NestJS, Drizzle (postgres-js), ioredis, Vitest. Migrations aplicadas no boot via `drizzle-orm/postgres-js/migrator` (`main.ts:47`, pasta `apps/api/drizzle/`).

**Invariantes (não quebrar):**
- Caminho quente de mensagem NÃO passa síncrono pelo Postgres (container 256MB; `db.module.ts`). Archive é write-behind, fora da request.
- Nunca sobrescrever/limpar chave que o N8N escreve além do LTRIM da cauda; o LTRIM só roda **após** archive bem-sucedido e **só** quando a lista excede o teto.
- `LTRIM` NÃO deve causar loop: `event.translator.ts:19` já ignora operações != rpush/lpush/set, então o evento de ltrim não vira `message.received`.
- Dedup/idempotência por WAMID; entradas legadas sem id (`msg-i`) usam fallback de chave estável (hash de conteúdo+timestamp+índice).

**Config (env):**
- `CHATHISTORY_HOT_CAP` (default `300`) — tamanho da cauda mantida no Redis.
- `CHATHISTORY_LTRIM_ENABLED` (default `false`) — liga o LTRIM só após o backfill validado.

---

## File Structure

- **Modify** `apps/api/src/core/db/schema.ts` — nova tabela `messages` (projeção durável).
- **Create** `apps/api/drizzle/XXXX_messages.sql` — migration gerada (via `drizzle-kit generate`).
- **Create** `apps/api/src/conversation/message-archive.repository.ts` — upsert idempotente + leitura de página fria.
- **Create** `apps/api/src/conversation/message-archive.repository.spec.ts`.
- **Create** `apps/api/src/conversation/message-archive.service.ts` — orquestra archive-da-cauda + LTRIM condicional.
- **Create** `apps/api/src/conversation/message-archive.service.spec.ts`.
- **Modify** `apps/api/src/realtime/keyspace.listener.ts` — chamar o archive service em `message.received`.
- **Modify** `apps/api/src/conversation/conversation.repository.ts` — leitura tiered (Redis cauda + Postgres frio) e assinatura de paginação.
- **Modify** `apps/api/src/conversation/conversation.repository.spec.ts` — cobrir fallback ao Postgres.
- **Create** `apps/api/src/conversation/chathistory-backfill.command.ts` — script único de backfill idempotente.
- **Create** `apps/api/src/conversation/chathistory-backfill.command.spec.ts`.

---

## Task 1: Tabela `messages` (projeção durável)

**Files:**
- Modify: `apps/api/src/core/db/schema.ts`
- Create: `apps/api/drizzle/` (migration gerada)

- [ ] **Step 1: Adicionar a tabela ao schema**

Em `apps/api/src/core/db/schema.ts`, seguindo o padrão das outras projeções:

```ts
// ---- Messages (projeção durável/archive do chathistory Redis; N8N+BFF escrevem o Redis) ----
// Fonte quente = lista Redis chathistory:{inst}-{phone}; esta tabela é o arquivo
// frio COMPLETO. Chave de dedup = (instancia, jid, msgId). Entradas legadas sem
// WAMID real recebem msgId sintético estável no archiver.
export const messages = pgTable(
  'messages',
  {
    instancia: text('instancia').notNull(),
    jid: text('jid').notNull(),
    msgId: text('msg_id').notNull(),
    fromMe: boolean('from_me').notNull().default(false),
    type: text('type'),                 // 'ai' | 'human' | ... (parsed.type do Redis)
    content: text('content'),
    mediaKind: text('media_kind'),      // image|audio|video|document|null
    mediaId: text('media_id'),
    mediaMimetype: text('media_mimetype'),
    quoted: jsonb('quoted').$type<{ id: string; preview: string; fromMe: boolean } | null>(),
    ts: timestamp('ts', { withTimezone: true }),
    raw: jsonb('raw').$type<unknown>().notNull(), // entrada crua do Redis (fidelidade total)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.instancia, t.jid, t.msgId] }),
    // Paginação fria: mensagens de uma conversa por ordem cronológica.
    byConversationTs: index('ix_msg_conv_ts').on(t.instancia, t.jid, t.ts),
  }),
);

export type MessageRow = typeof messages.$inferSelect;
```

- [ ] **Step 2: Gerar a migration**

Run: `npm run db:generate --prefix apps/api`
Expected: novo arquivo em `apps/api/drizzle/XXXX_*.sql` + entrada no `apps/api/drizzle/meta/_journal.json`.
**Conferir o `journal`** (gotcha conhecido — ordem cronológica correta; ver `project_drizzle_journal_gotcha`).

- [ ] **Step 3: Verificar typecheck**

Run: `npm run lint --prefix apps/api`
Expected: PASS (sem erros de tipo).

- [ ] **Step 4: Commit**

```
git add -f apps/api/src/core/db/schema.ts apps/api/drizzle/
git commit -m "feat(db): tabela messages (archive durável do chathistory)"
```

---

## Task 2: `MessageArchiveRepository` — upsert idempotente + página fria

**Files:**
- Create: `apps/api/src/conversation/message-archive.repository.ts`
- Test: `apps/api/src/conversation/message-archive.repository.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
// Usa o harness de DB de teste do projeto (ver conversation-projection.service.spec.ts
// para o padrão de Database em memória/efêmero já usado).

describe('MessageArchiveRepository', () => {
  it('upsert do mesmo msgId duas vezes grava UMA linha', async () => {
    const repo = makeRepo(); // helper do teste
    const entry = { msgId: 'WAMID1', instancia: 'shk', jid: '5511@s.whatsapp.net', content: 'oi', raw: {} };
    await repo.upsertMany('shk', '5511@s.whatsapp.net', [entry]);
    await repo.upsertMany('shk', '5511@s.whatsapp.net', [entry]);
    const rows = await repo.readPage('shk', '5511@s.whatsapp.net', { limit: 10 });
    expect(rows).toHaveLength(1);
  });

  it('readPage retorna mensagens anteriores ao cursor, em ordem cronológica', async () => {
    const repo = makeRepo();
    // ... insere 3 mensagens com ts crescente ...
    const older = await repo.readPage('shk', '5511@s.whatsapp.net', { beforeTs: T2, limit: 10 });
    expect(older.map((m) => m.msgId)).toEqual(['m0', 'm1']); // só as < T2
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `npm test --prefix apps/api -- message-archive.repository`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o repositório**

```ts
import { Injectable, Inject } from '@nestjs/common';
import { DB, type Database } from '../core/db/db.module';
import { messages, type MessageRow } from '../core/db/schema';
import { and, eq, lt, asc, desc } from 'drizzle-orm';

export interface ArchiveEntry {
  msgId: string;
  fromMe?: boolean;
  type?: string | null;
  content?: string | null;
  mediaKind?: string | null;
  mediaId?: string | null;
  mediaMimetype?: string | null;
  quoted?: { id: string; preview: string; fromMe: boolean } | null;
  ts?: Date | null;
  raw: unknown;
}

@Injectable()
export class MessageArchiveRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Idempotente: ON CONFLICT (instancia, jid, msgId) DO NOTHING. */
  async upsertMany(instancia: string, jid: string, entries: ArchiveEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(messages)
      .values(entries.map((e) => ({ instancia, jid, ...e, raw: e.raw })))
      .onConflictDoNothing({ target: [messages.instancia, messages.jid, messages.msgId] });
  }

  /** Página fria em ordem cronológica; `beforeTs` para paginar para trás. */
  async readPage(
    instancia: string,
    jid: string,
    opts: { beforeTs?: Date; limit: number },
  ): Promise<MessageRow[]> {
    const conds = [eq(messages.instancia, instancia), eq(messages.jid, jid)];
    if (opts.beforeTs) conds.push(lt(messages.ts, opts.beforeTs));
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(desc(messages.ts))
      .limit(opts.limit);
    return rows.reverse(); // cronológico ascendente para a UI
  }
}
```

- [ ] **Step 4: Rodar o teste (deve passar)**

Run: `npm test --prefix apps/api -- message-archive.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -f apps/api/src/conversation/message-archive.repository.ts apps/api/src/conversation/message-archive.repository.spec.ts
git commit -m "feat(conversation): MessageArchiveRepository (upsert idempotente + página fria)"
```

---

## Task 3: `MessageArchiveService` — archive da cauda + LTRIM condicional

**Files:**
- Create: `apps/api/src/conversation/message-archive.service.ts`
- Test: `apps/api/src/conversation/message-archive.service.spec.ts`

Reaproveita o parsing de entrada do `ConversationRepository.getMessages` (dedup por WAMID, `parsed.data.timestamp`, `media.id`, fallback `msg-i`). **DRY:** extrair a função de parse de uma entrada crua para um util compartilhado (`parseHistoryEntry`) e usá-la aqui e no repository.

- [ ] **Step 1: Teste que falha — archive + LTRIM condicional**

```ts
describe('MessageArchiveService.archiveTail', () => {
  it('arquiva a cauda e, com LTRIM ligado e lista > cap, apara para o cap', async () => {
    const redis = fakeRedis({ 'chathistory:shk-5511': makeEntries(500) });
    const svc = makeSvc(redis, { hotCap: 300, ltrimEnabled: true });
    await svc.archiveTail('shk', '5511@s.whatsapp.net');
    expect(archiveRepo.upsertMany).toHaveBeenCalled();
    expect(redis.ltrim).toHaveBeenCalledWith('chathistory:shk-5511', -300, -1);
  });

  it('com LTRIM desligado NÃO apara (só arquiva)', async () => {
    const redis = fakeRedis({ 'chathistory:shk-5511': makeEntries(500) });
    const svc = makeSvc(redis, { hotCap: 300, ltrimEnabled: false });
    await svc.archiveTail('shk', '5511@s.whatsapp.net');
    expect(redis.ltrim).not.toHaveBeenCalled();
  });

  it('lista <= cap: nunca apara', async () => {
    const redis = fakeRedis({ 'chathistory:shk-5511': makeEntries(100) });
    const svc = makeSvc(redis, { hotCap: 300, ltrimEnabled: true });
    await svc.archiveTail('shk', '5511@s.whatsapp.net');
    expect(redis.ltrim).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npm test --prefix apps/api -- message-archive.service`
Expected: FAIL.

- [ ] **Step 3: Implementar o service**

```ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import { MessageArchiveRepository, type ArchiveEntry } from './message-archive.repository';
import { parseHistoryEntry } from './parse-history-entry'; // util DRY extraído

@Injectable()
export class MessageArchiveService {
  private readonly logger = new Logger(MessageArchiveService.name);
  private readonly hotCap: number;
  private readonly ltrimEnabled: boolean;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly archive: MessageArchiveRepository,
    config: ConfigService,
  ) {
    this.hotCap = Number(config.get('CHATHISTORY_HOT_CAP') ?? 300);
    this.ltrimEnabled = String(config.get('CHATHISTORY_LTRIM_ENABLED') ?? 'false') === 'true';
  }

  /** Write-behind: espelha a cauda no Postgres e apara o Redis (condicional). */
  async archiveTail(instancia: string, jid: string): Promise<void> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const len = await this.redis.llen(histKey);
    if (len === 0) return;

    // Arquiva a cauda com folga (cobre rajadas entre eventos).
    const tail = await this.redis.lrange(histKey, -(this.hotCap + 50), -1);
    const entries: ArchiveEntry[] = tail
      .map((raw, i) => parseHistoryEntry(raw, i))
      .filter((e): e is ArchiveEntry => e !== null);
    if (entries.length > 0) {
      await this.archive.upsertMany(instancia, jid, entries);
    }

    // Só apara DEPOIS do archive OK, com flag ligada e lista acima do teto.
    if (this.ltrimEnabled && len > this.hotCap) {
      await this.redis.ltrim(histKey, -this.hotCap, -1);
    }
  }
}
```

`parse-history-entry.ts` (util DRY, extraído do parsing atual de `getMessages`): retorna `ArchiveEntry | null`, chaveando `msgId = parsed.id || media.id || 'legacy-'+hash(raw+i)`.

- [ ] **Step 4: Rodar (deve passar)**

Run: `npm test --prefix apps/api -- message-archive.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -f apps/api/src/conversation/message-archive.service.ts apps/api/src/conversation/message-archive.service.spec.ts apps/api/src/conversation/parse-history-entry.ts
git commit -m "feat(conversation): MessageArchiveService (archive write-behind + LTRIM condicional)"
```

---

## Task 4: Enganchar o archive no keyspace listener

**Files:**
- Modify: `apps/api/src/realtime/keyspace.listener.ts`
- Modify: `apps/api/src/realtime/*module*.ts` (prover `MessageArchiveService`)

- [ ] **Step 1: Teste — em message.received, o archive é chamado**

Estender `apps/api/src/realtime/keyspace.listener.spec.ts`: ao emitir `rpush` em `chathistory:shk-5511...`, o `MessageArchiveService.archiveTail` é chamado com `(instancia, jid)`.

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npm test --prefix apps/api -- keyspace.listener`
Expected: FAIL.

- [ ] **Step 3: Injetar e chamar (write-behind, não bloqueia o realtime)**

No handler de `message.received` (junto do `projection.project`), adicionar:

```ts
if (event.type === 'message.received') {
  await this.redis.sadd(...).catch(...);        // (já existe)
  this.archive
    .archiveTail(event.instancia, event.jid)
    .catch((err: Error) => this.logger.warn(`archive failed: ${err.message}`));
}
```

Injetar `MessageArchiveService` no construtor e exportá-lo/prover no módulo do realtime/conversation. **Não** dar `await` que atrase o publish do evento realtime — o archive é best-effort write-behind.

- [ ] **Step 4: Rodar (deve passar)**

Run: `npm test --prefix apps/api -- keyspace.listener`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -f apps/api/src/realtime/
git commit -m "feat(realtime): dispara archive write-behind do chathistory no keyspace"
```

---

## Task 5: Leitura tiered em `ConversationRepository`

**Files:**
- Modify: `apps/api/src/conversation/conversation.repository.ts`
- Modify: `apps/api/src/conversation/conversation.repository.spec.ts`

- [ ] **Step 1: Teste — fallback ao Postgres para páginas antigas**

```ts
it('getMessages devolve a cauda do Redis quando cabe no cap', async () => {
  // lista com 50 entradas, cap 300 → tudo do Redis, Postgres não é tocado
});
it('getMessagesPage(beforeTs) lê do Postgres (histórico frio)', async () => {
  // Redis só tem a cauda; pedir anteriores → MessageArchiveRepository.readPage
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npm test --prefix apps/api -- conversation.repository`
Expected: FAIL.

- [ ] **Step 3: Implementar leitura tiered**

- `getMessages(instancia, jid, limit)` continua lendo a cauda do Redis (comportamento atual preservado — a cauda quente cobre o caso comum).
- Novo `getMessagesPage(instancia, jid, { beforeTs, limit })`: se `beforeTs` cai antes da cauda do Redis, delega ao `MessageArchiveRepository.readPage`. Reaproveitar `parseHistoryEntry`/mapeamento existente para o mesmo shape `Message`.
- Injetar `MessageArchiveRepository` no `ConversationRepository`.

- [ ] **Step 4: Rodar (deve passar)**

Run: `npm test --prefix apps/api -- conversation.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -f apps/api/src/conversation/conversation.repository.ts apps/api/src/conversation/conversation.repository.spec.ts
git commit -m "feat(conversation): leitura tiered (cauda Redis + histórico frio Postgres)"
```

> **Nota de escopo (endpoint HTTP de paginação):** expor `getMessagesPage` via controller (scroll-para-cima na UI) é uma tarefa de frontend/controller pequena — pode virar sub-tarefa aqui ou item da Etapa 5. YAGNI até a UI precisar; o archive/LTRIM já entregam o ganho de memória sem ela.

---

## Task 6: Backfill único do histórico existente

**Files:**
- Create: `apps/api/src/conversation/chathistory-backfill.command.ts`
- Test: `apps/api/src/conversation/chathistory-backfill.command.spec.ts`

**Por quê:** antes de ligar `CHATHISTORY_LTRIM_ENABLED=true` em produção, o Postgres precisa já conter o histórico existente — senão o LTRIM descartaria mensagens ainda não arquivadas.

- [ ] **Step 1: Teste — backfill idempotente varre todas as listas**

```ts
it('varre chathistory:{inst}-* e arquiva cada lista (idempotente)', async () => {
  // SCAN de 2 conversas → upsertMany chamado para cada; rodar 2x não duplica
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npm test --prefix apps/api -- chathistory-backfill`
Expected: FAIL.

- [ ] **Step 3: Implementar o comando**

- `SCAN` por `chathistory:*` (usar cursor, não `KEYS`), derivar `(instancia, jid)` do padrão `chathistory:{inst}-{phone}` (ver `conversation-index.service.ts:47-49` para o parse legado), e chamar `archive.upsertMany` com a lista inteira (`lrange 0 -1`).
- Executável standalone (script npm) OU um `onApplicationBootstrap` guardado por flag `BACKFILL_CHATHISTORY=once`. **NÃO** fazer LTRIM no backfill (só arquivar).

- [ ] **Step 4: Rodar (deve passar)**

Run: `npm test --prefix apps/api -- chathistory-backfill`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -f apps/api/src/conversation/chathistory-backfill.command.ts apps/api/src/conversation/chathistory-backfill.command.spec.ts
git commit -m "feat(conversation): backfill único do chathistory para o Postgres"
```

---

## Task 7: Suite verde + verificação final

- [ ] **Step 1: Rodar toda a suite da API**

Run: `npm test --prefix apps/api`
Expected: PASS (todos os testes, incluindo os pré-existentes).

- [ ] **Step 2: Typecheck**

Run: `npm run lint --prefix apps/api`
Expected: PASS.

- [ ] **Step 3: Commit final se houver ajustes**

```
git add -f apps/api/
git commit -m "test(conversation): suite verde do tiering do Redis"
```

---

## Rollout (runbook — passos do Rafa, fora da pipeline)

1. Deploy com `CHATHISTORY_LTRIM_ENABLED=false` → archive write-behind começa a popular o Postgres em tempo real.
2. Rodar o **backfill** uma vez (Task 6) → histórico antigo entra no Postgres.
3. Validar contagens (Redis `llen` vs linhas no Postgres por conversa) numa amostra.
4. Ligar `CHATHISTORY_LTRIM_ENABLED=true` → Redis passa a manter só a cauda (`CHATHISTORY_HOT_CAP`).
5. Observar memória do Redis cair; validar que a UI e o N8N seguem lendo a cauda normalmente.

**Rollback:** desligar `CHATHISTORY_LTRIM_ENABLED` (para de aparar). O que já foi aparado permanece no Postgres (leitura tiered cobre). Sem perda.
