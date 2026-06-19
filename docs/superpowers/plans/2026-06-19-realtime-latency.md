# Realtime & Latency Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the NEXUS panel update in real time when the client interacts on WhatsApp (new message, AI typing, funnel move, payment), persist operator-sent messages, load all conversations, and be ready for multiple replicas.

**Architecture:** Passive Redis keyspace notifications drive client-originated events; the API enables `notify-keyspace-events` itself on boot. Conversations are discovered via a per-tenant Redis SET index instead of a global `SCAN`. Value-changing events carry the new value so the frontend patches its cache instead of refetching everything. Socket.IO broadcasts cross replicas via the Redis adapter, with a poll/reconcile safety net for the lossy keyspace channel.

**Tech Stack:** NestJS 10, Fastify, ioredis, Socket.IO + `@socket.io/redis-adapter`, Next.js 14, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-realtime-latency-architecture-design.md`

**Decisions locked in brainstorming:**
- Passive keyspace (N8N is NOT modified).
- API auto-configures `notify-keyspace-events KEA` on boot.
- Per-tenant SET index `conversas:{inst}` for conversation discovery.
- Socket.IO Redis adapter now.
- Kanban keeps reading leads from Google Sheets; realtime moves come from the
  enriched `funnel.changed` event patching the `['leads']` cache (the conversation
  index does NOT feed the Kanban).

---

## File Structure

**API (apps/api):**
- Create `src/realtime/keyspace-config.service.ts` — enables/validates `notify-keyspace-events` on boot.
- Create `src/realtime/redis-io.adapter.ts` — Socket.IO adapter wired to Redis pub/sub.
- Create `src/conversation/conversation-index.service.ts` — owns the `conversas:{inst}` SET (add/list) + boot backfill.
- Modify `src/realtime/realtime.module.ts` — register `KeyspaceConfigService`.
- Modify `src/realtime/keyspace.listener.ts` — configurable DB index, watch `chathistory:*`, SADD index on rpush.
- Modify `src/realtime/event.translator.ts` — async, inject Redis, parse `chathistory:{inst}-{phone}`, enrich `funnel.changed`/`ai.toggled`.
- Modify `src/conversation/conversation.module.ts` — provide/export `ConversationIndexService`, register backfill.
- Modify `src/conversation/conversation.repository.ts` — `findAllJids` reads the index.
- Modify `src/conversation/conversation.service.ts` — `sendMessage` persists message + pauses AI + indexes.
- Modify `src/onboarding/sync.service.ts` — SADD index per imported chat.
- Modify `src/webhook/webhook.service.ts` — SADD index per processed message.
- Modify `src/main.ts` — install the Redis Socket.IO adapter.
- Modify `packages/shared/src/constants/redis-keys.ts` — add `conversationIndex(inst)`.

**Web (apps/web):**
- Modify `src/hooks/use-socket.ts` — scoped invalidation, cache patching, reconcile on connect.
- Modify `src/hooks/use-messages.ts` — optimistic send append.
- Modify `src/hooks/use-conversations.ts` — background poll safety net.

**Dependency:** add `@socket.io/redis-adapter` to `apps/api/package.json`.

---

## Task 1: Boot-time keyspace configuration

Without `notify-keyspace-events`, the entire passive layer is silent. The API sets it on boot and validates, logging an error (not throwing) on failure.

**Files:**
- Create: `apps/api/src/realtime/keyspace-config.service.ts`
- Modify: `apps/api/src/realtime/realtime.module.ts`
- Test: `apps/api/src/realtime/keyspace-config.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/realtime/keyspace-config.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyspaceConfigService } from './keyspace-config.service';

function makeRedis(getReturn = 'notify-keyspace-events\nKEA') {
  return {
    config: vi.fn(async (op: string) => {
      if (op === 'SET') return 'OK';
      return ['notify-keyspace-events', getReturn.split('\n')[1] ?? 'KEA'];
    }),
  } as any;
}

describe('KeyspaceConfigService', () => {
  let redis: any;
  beforeEach(() => { redis = makeRedis(); });

  it('sets notify-keyspace-events to KEA on bootstrap', async () => {
    const svc = new KeyspaceConfigService(redis);
    await svc.onApplicationBootstrap();
    expect(redis.config).toHaveBeenCalledWith('SET', 'notify-keyspace-events', 'KEA');
  });

  it('reports ready=true when validation shows keyspace classes', async () => {
    const svc = new KeyspaceConfigService(redis);
    await svc.onApplicationBootstrap();
    expect(svc.isReady()).toBe(true);
  });

  it('does not throw and reports ready=false when CONFIG SET fails', async () => {
    redis.config = vi.fn(async () => { throw new Error('CONFIG disabled'); });
    const svc = new KeyspaceConfigService(redis);
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.isReady()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/realtime/keyspace-config.service.spec.ts`
Expected: FAIL — cannot find module `./keyspace-config.service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/realtime/keyspace-config.service.ts
import { Injectable, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';

/**
 * Ensures Redis emits keyspace notifications, which the entire passive realtime
 * layer depends on. Runs `CONFIG SET notify-keyspace-events KEA` on boot and
 * validates it stuck. A managed Redis that blocks CONFIG will fail here — we log
 * an error and mark realtime degraded (the poll safety net keeps the panel
 * eventually consistent), but never crash the app.
 */
@Injectable()
export class KeyspaceConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KeyspaceConfigService.name);
  private ready = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  isReady(): boolean {
    return this.ready;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.redis.config('SET', 'notify-keyspace-events', 'KEA');
      const result = (await this.redis.config('GET', 'notify-keyspace-events')) as string[];
      const value = result?.[1] ?? '';
      // Need keyspace events (K) plus generic/string/list classes (covered by A).
      this.ready = value.includes('K') && (value.includes('A') || value.includes('g'));
      if (this.ready) {
        this.logger.log(`Keyspace notifications enabled (notify-keyspace-events=${value})`);
      } else {
        this.logger.error(`Keyspace notifications NOT active (got '${value}') — realtime degraded`);
      }
    } catch (err) {
      this.ready = false;
      this.logger.error(
        `Could not configure notify-keyspace-events — realtime degraded: ${(err as Error).message}`,
      );
    }
  }
}
```

- [ ] **Step 4: Register the provider**

In `apps/api/src/realtime/realtime.module.ts`, import and add `KeyspaceConfigService` to `providers`, and add it to `exports` (the health module may report its `isReady()` later).

```ts
import { KeyspaceConfigService } from './keyspace-config.service';
// ...
providers: [
  EventsGateway,
  KeyspaceListener,
  EventTranslator,
  EventPublisher,
  StreamReplayService,
  KeyspaceConfigService,
],
exports: [EventPublisher, KeyspaceConfigService],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/realtime/keyspace-config.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/api && npm run lint
git add apps/api/src/realtime/keyspace-config.service.ts apps/api/src/realtime/keyspace-config.service.spec.ts apps/api/src/realtime/realtime.module.ts
git commit -m "feat(realtime): enable notify-keyspace-events on boot"
```

---

## Task 2: Shared key + RedisKeys for the conversation index

**Files:**
- Modify: `packages/shared/src/constants/redis-keys.ts`
- Test: `packages/shared/src/constants/redis-keys.spec.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/constants/redis-keys.spec.ts
import { describe, it, expect } from 'vitest';
import { RedisKeys } from './redis-keys';

describe('RedisKeys.conversationIndex', () => {
  it('namespaces the index per instance', () => {
    expect(RedisKeys.conversationIndex('shk')).toBe('conversas:shk');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/constants/redis-keys.spec.ts`
Expected: FAIL — `conversationIndex` is not a function.

- [ ] **Step 3: Add the key**

In `packages/shared/src/constants/redis-keys.ts`, after `cacheContacts`:

```ts
  // ---- Conversation discovery index (BFF maintains, list reads) ----

  conversationIndex: (inst: string) =>
    `conversas:${inst}`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run src/constants/redis-keys.spec.ts`
Expected: PASS.

> If `packages/shared` has no vitest config, add a minimal one mirroring `apps/api/vitest.config.ts` (or run the test from `apps/api` by importing the source). Prefer adding the config to keep shared tests local.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/redis-keys.ts packages/shared/src/constants/redis-keys.spec.ts
git commit -m "feat(shared): add conversationIndex redis key"
```

---

## Task 3: ConversationIndexService (add + list + boot backfill)

Owns the `conversas:{inst}` SET. `addJid` is called by every writer; `listJids` replaces the global scan; the boot backfill populates the index from existing data once.

**Files:**
- Create: `apps/api/src/conversation/conversation-index.service.ts`
- Modify: `apps/api/src/conversation/conversation.module.ts`
- Test: `apps/api/src/conversation/conversation-index.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/conversation/conversation-index.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationIndexService } from './conversation-index.service';
import { RedisKeys } from '@nexus/shared';

function makeRedis() {
  const store = new Map<string, Set<string>>();
  return {
    store,
    sadd: vi.fn(async (key: string, ...members: string[]) => {
      const s = store.get(key) ?? new Set<string>();
      members.forEach((m) => s.add(m));
      store.set(key, s);
      return members.length;
    }),
    smembers: vi.fn(async (key: string) => Array.from(store.get(key) ?? [])),
    scard: vi.fn(async (key: string) => (store.get(key)?.size ?? 0)),
    scan: vi.fn(async () => ['0', []]),
  } as any;
}

describe('ConversationIndexService', () => {
  let redis: any;
  let svc: ConversationIndexService;
  beforeEach(() => {
    redis = makeRedis();
    svc = new ConversationIndexService(redis);
  });

  it('adds a jid to the per-tenant index', async () => {
    await svc.addJid('shk', '5511@s.whatsapp.net');
    expect(redis.sadd).toHaveBeenCalledWith(RedisKeys.conversationIndex('shk'), '5511@s.whatsapp.net');
  });

  it('lists jids from the index', async () => {
    await svc.addJid('shk', 'a@s.whatsapp.net');
    await svc.addJid('shk', 'b@lid');
    const jids = await svc.listJids('shk');
    expect(jids.sort()).toEqual(['a@s.whatsapp.net', 'b@lid']);
  });

  it('ignores empty jids', async () => {
    await svc.addJid('shk', '');
    expect(redis.sadd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/conversation/conversation-index.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/conversation/conversation-index.service.ts
import { Injectable, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';

/**
 * Per-tenant conversation discovery index (`conversas:{inst}` SET). Replaces the
 * old global `SCAN chat:{inst}:*:followup_step`, which was both incomplete
 * (conversations without that exact key were invisible) and O(keyspace) across
 * all tenants in the shared Redis.
 */
@Injectable()
export class ConversationIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConversationIndexService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async addJid(instancia: string, jid: string): Promise<void> {
    if (!jid) return;
    await this.redis.sadd(RedisKeys.conversationIndex(instancia), jid);
  }

  async listJids(instancia: string): Promise<string[]> {
    return this.redis.smembers(RedisKeys.conversationIndex(instancia));
  }

  /**
   * One-time backfill: if a tenant's index is empty, rebuild it from existing
   * `chat:{inst}:*:followup_step` keys and `chathistory:{inst}-*` lists. Runs per
   * tenant found in the registry. Idempotent — SADD dedupes.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const raw = await this.redis.get(RedisKeys.tenantRegistry());
      if (!raw) return;
      const registry = JSON.parse(raw);
      const tenants: Array<{ instancia: string }> = registry.tenants ?? [];

      for (const { instancia } of tenants) {
        const indexKey = RedisKeys.conversationIndex(instancia);
        if ((await this.redis.scard(indexKey)) > 0) continue;

        const jids = new Set<string>();
        for (const key of await this.scan(`chat:${instancia}:*:followup_step`)) {
          jids.add(key.split(':')[2]);
        }
        // chathistory:{inst}-{phone} → jid (legacy phones become @s.whatsapp.net)
        for (const key of await this.scan(`chathistory:${instancia}-*`)) {
          const id = key.slice(`chathistory:${instancia}-`.length);
          if (!id) continue;
          jids.add(id.includes('@') ? id : `${id}@s.whatsapp.net`);
        }
        if (jids.size > 0) {
          await this.redis.sadd(indexKey, ...jids);
          this.logger.log(`index-backfill instancia=${instancia} count=${jids.size}`);
        }
      }
    } catch (err) {
      this.logger.warn(`index-backfill failed: ${(err as Error).message}`);
    }
  }

  private async scan(pattern: string): Promise<string[]> {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      out.push(...keys);
    } while (cursor !== '0');
    return out;
  }
}
```

- [ ] **Step 4: Register + export in the module**

In `apps/api/src/conversation/conversation.module.ts`: add `ConversationIndexService` to `providers` and `exports` so webhook/onboarding modules can inject it (import `ConversationModule` there if not already).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/conversation/conversation-index.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/conversation/conversation-index.service.ts apps/api/src/conversation/conversation-index.service.spec.ts apps/api/src/conversation/conversation.module.ts
git commit -m "feat(conversation): per-tenant index service with boot backfill"
```

---

## Task 4: List reads the index

**Files:**
- Modify: `apps/api/src/conversation/conversation.repository.ts:36-45` (`findAllJids`)
- Modify: `apps/api/src/conversation/conversation.service.ts` (inject index; pass-through)
- Test: extend `apps/api/src/onboarding/sync.service.spec.ts` pattern → new `apps/api/src/conversation/conversation.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/conversation/conversation.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from './conversation.service';

it('lists conversations from the index, not a global scan', async () => {
  const repo = {
    buildListItem: vi.fn(async (_i: string, jid: string) => ({
      jid, lastActivity: new Date().toISOString(), stage: 'S0', aiState: 'ON',
    })),
  } as any;
  const index = { listJids: vi.fn(async () => ['a@s.whatsapp.net', 'b@lid']) } as any;
  const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') } as any;
  const svc = new ConversationService(repo, {} as any, {} as any, redis, index);

  const result = await svc.listConversations('shk', {});
  expect(index.listJids).toHaveBeenCalledWith('shk');
  expect(result).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/conversation/conversation.service.spec.ts`
Expected: FAIL — constructor arity / `index` undefined.

- [ ] **Step 3: Implement**

In `conversation.service.ts`, inject `ConversationIndexService` as the 5th constructor arg and replace `const jids = await this.repo.findAllJids(instancia)` with `const jids = await this.index.listJids(instancia)`.

In `conversation.repository.ts`, keep `findAllJids` for the backfill path but it is no longer on the hot path. (Optional: delete it if nothing else uses it — verify with grep first.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/conversation/conversation.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/api && npm run lint
git add apps/api/src/conversation/conversation.service.ts apps/api/src/conversation/conversation.service.spec.ts apps/api/src/conversation/conversation.repository.ts
git commit -m "feat(conversation): list from per-tenant index"
```

---

## Task 5: Writers populate the index (sync + webhook)

**Files:**
- Modify: `apps/api/src/onboarding/sync.service.ts` (after a chat is imported)
- Modify: `apps/api/src/webhook/webhook.service.ts:98` (after rpush in `processOneMessage`)
- Modify: `apps/api/src/onboarding/onboarding.module.ts` and `apps/api/src/webhook/webhook.module.ts` to import `ConversationModule`
- Test: extend `apps/api/src/onboarding/sync.service.spec.ts`

- [ ] **Step 1: Write/extend the failing test**

Add to `sync.service.spec.ts` a case asserting that importing a chat calls `index.addJid(instancia, jid)` with the resolved canonical jid. Mock `ConversationIndexService` and pass it to the `SyncService` constructor.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/onboarding/sync.service.spec.ts`
Expected: FAIL — index not called / constructor arity.

- [ ] **Step 3: Implement**

- `SyncService`: inject `ConversationIndexService`; in `syncOneChat`, after a successful import (`count > 0`), call `await this.index.addJid(instancia, jid)`.
- `WebhookService`: inject `ConversationIndexService`; in `processOneMessage`, after `await this.redis.rpush(histKey, entry)`, call `await this.index.addJid(instanceName, jid)`.
- Wire modules: `OnboardingModule` and `WebhookModule` import `ConversationModule` (which exports `ConversationIndexService`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/onboarding/sync.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/api && npm run lint
git add apps/api/src/onboarding/ apps/api/src/webhook/
git commit -m "feat(realtime): index conversations from sync and webhook"
```

---

## Task 6: Persist operator-sent messages (Bug A)

**Files:**
- Modify: `apps/api/src/conversation/conversation.service.ts` (`sendMessage`)
- Test: `apps/api/src/conversation/conversation.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('persists the outbound message, pauses AI, and indexes the jid', async () => {
  const calls: any = { rpush: [], set: [] };
  const redis = {
    get: vi.fn(async () => null),
    set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
    rpush: vi.fn(async (...a: any[]) => { calls.rpush.push(a); return 1; }),
  } as any;
  const evolution = { sendTextMessage: vi.fn(async () => undefined) } as any;
  const index = { addJid: vi.fn(async () => undefined), listJids: vi.fn() } as any;
  const svc = new ConversationService({} as any, evolution, {} as any, redis, index);

  await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

  expect(evolution.sendTextMessage).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net', 'oi');
  expect(calls.rpush[0][0]).toBe('chathistory:shk-5511'); // history key
  expect(JSON.parse(calls.rpush[0][1]).data.content).toBe('oi');
  expect(redis.set).toHaveBeenCalled(); // humanControlUntil
  expect(index.addJid).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/conversation/conversation.service.spec.ts`
Expected: FAIL — `sendMessage` does none of this yet.

- [ ] **Step 3: Implement**

Replace `ConversationService.sendMessage` body:

```ts
async sendMessage(instancia: string, jid: string, text: string): Promise<{ message: string }> {
  await this.evolution.sendTextMessage(instancia, jid, text);

  const phone = jid.replace('@s.whatsapp.net', '');
  const histKey = RedisKeys.chatHistory(instancia, phone);
  const entry = JSON.stringify({ type: 'ai', data: { content: text, timestamp: Date.now() } });
  await this.redis.rpush(histKey, entry); // also fires keyspace message.received

  // Operator message = human takeover. Pause AI for 30min (V6.0 default).
  const until = Date.now() + 30 * 60 * 1000;
  await this.redis.set(RedisKeys.humanControlUntil(instancia, jid), String(until));

  await this.index.addJid(instancia, jid);
  await this.redis.del(RedisKeys.cacheConversations(instancia));

  this.logger.log(`Message sent + persisted for ${instancia}/${jid}`);
  return { message: 'Mensagem enviada' };
}
```

Add `RedisKeys` import if missing (it is already imported).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/conversation/conversation.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/api && npm run lint
git add apps/api/src/conversation/conversation.service.ts apps/api/src/conversation/conversation.service.spec.ts
git commit -m "fix(conversation): persist operator message and pause AI on send"
```

---

## Task 7: Keyspace listener watches the real data keys

**Files:**
- Modify: `apps/api/src/realtime/keyspace.listener.ts`
- Test: covered indirectly; add a focused unit test if the listener is refactored to expose pattern building.

- [ ] **Step 1: Implement configurable DB + chathistory pattern**

In `keyspace.listener.ts`:
- Derive the DB index from the Redis connection options: `const db = (this.redis.options?.db ?? 0);` and build patterns with `__keyspace@${db}__:`.
- Replace the `chat:*:buffer` pattern with `chathistory:*` (the real message store):

```ts
private patternsFor(db: number) {
  return [
    `__keyspace@${db}__:chathistory:*`,
    `__keyspace@${db}__:chat:*:humanControlUntil`,
    `__keyspace@${db}__:chat:*:paymentStatus`,
    `__keyspace@${db}__:chat:*:processing`,
    `__keyspace@${db}__:chat:*:followup_step`,
  ];
}
```

- In the `pmessage` handler, after a successful translate that yields a `message.received` whose channel matches `chathistory:`, also `SADD` the index (self-heal). Derive instancia/jid from the translated event.

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/realtime/keyspace.listener.ts
git commit -m "feat(realtime): watch chathistory + configurable keyspace db"
```

---

## Task 8: Translator — chathistory branch + enriched events

**Files:**
- Modify: `apps/api/src/realtime/event.translator.ts` (make `translate` async, inject Redis)
- Modify: `apps/api/src/realtime/keyspace.listener.ts` (await `translate`)
- Test: `apps/api/src/realtime/event.translator.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/realtime/event.translator.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { EventTranslator } from './event.translator';

const redis = { get: vi.fn(async (k: string) => (k.endsWith('followup_step') ? 'S3' : null)) } as any;

describe('EventTranslator', () => {
  const t = new EventTranslator(redis);

  it('maps chathistory rpush to message.received with derived legacy jid', async () => {
    const e = await t.translate('__keyspace@0__:chathistory:shk-5511952480228', 'rpush');
    expect(e).toMatchObject({ type: 'message.received', instancia: 'shk', jid: '5511952480228@s.whatsapp.net' });
  });

  it('derives @lid jid for opaque ids', async () => {
    const e = await t.translate('__keyspace@0__:chathistory:shk-262246475239430@lid', 'rpush');
    expect(e?.jid).toBe('262246475239430@lid');
  });

  it('enriches funnel.changed with the new stage value', async () => {
    const e = await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:followup_step', 'set');
    expect(e).toMatchObject({ type: 'funnel.changed', payload: { stage: 'S3' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/realtime/event.translator.spec.ts`
Expected: FAIL — `translate` is sync / no redis / no chathistory branch.

- [ ] **Step 3: Implement**

- Inject `@Inject(REDIS_CLIENT) redis: Redis` into `EventTranslator`.
- Make `translate(channel, operation)` async, returning `Promise<NexusEvent | null>`.
- Add a branch: if the key (after stripping `__keyspace@{db}__:`) starts with `chathistory:`, parse `chathistory:{inst}-{id}`. Split on the FIRST `-` after `chathistory:` to get `inst`; the remainder is `id`. Derive `jid = id.includes('@') ? id : id + '@s.whatsapp.net'`. On `rpush`/`lpush`/`set`, return `{ type: 'message.received', instancia, jid, ts, payload: {} }`.
- For `followup_step` on `set`: GET the value and return `payload: { stage: value }`.
- For `humanControlUntil`: on `del`/`expired` → `payload: { state: 'ON' }`; on `set` → GET value, `payload: { state: 'OFF', until: Number(value) }`.
- Keep `processing` and `paymentStatus` as-is.

> Edge: instance names contain no `-` in this codebase (e.g. `shk`, `nexusdev`); split on the first `-` is safe. If an instance ever contains `-`, switch to matching the known tenant list. Document this assumption in a comment.

- In `keyspace.listener.ts`, change `const event = this.translator.translate(...)` to `const event = await this.translator.translate(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/realtime/event.translator.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/api && npm run lint
git add apps/api/src/realtime/event.translator.ts apps/api/src/realtime/event.translator.spec.ts apps/api/src/realtime/keyspace.listener.ts
git commit -m "feat(realtime): chathistory branch and enriched funnel/ai events"
```

---

## Task 9: Socket.IO Redis adapter (horizontal scale)

**Files:**
- Modify: `apps/api/package.json` (add `@socket.io/redis-adapter`)
- Create: `apps/api/src/realtime/redis-io.adapter.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add dependency**

Run: `cd apps/api && npm install @socket.io/redis-adapter`

- [ ] **Step 2: Create the adapter**

```ts
// apps/api/src/realtime/redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub so broadcasts reach clients on every
 * replica. Uses two duplicated ioredis connections (pub/sub channels must not
 * share the command connection).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, private readonly redis: Redis) {
    super(app);
  }

  async connect(): Promise<void> {
    const pubClient = this.redis.duplicate();
    const subClient = this.redis.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

- [ ] **Step 3: Install it in main.ts**

In `apps/api/src/main.ts`, after the app is created and before `app.listen`:

```ts
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { REDIS_CLIENT } from './core/redis/redis.module';
// ...
const redisAdapter = new RedisIoAdapter(app, app.get(REDIS_CLIENT));
await redisAdapter.connect();
app.useWebSocketAdapter(redisAdapter);
```

- [ ] **Step 4: Build to verify wiring**

Run: `cd apps/api && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/realtime/redis-io.adapter.ts apps/api/src/main.ts
git commit -m "feat(realtime): Socket.IO Redis adapter for multi-replica broadcast"
```

> Note: this repo uses pnpm workspaces (see `pnpm-store`). If so, run `pnpm add @socket.io/redis-adapter --filter @nexus/api` instead and stage `pnpm-lock.yaml`.

---

## Task 10: Frontend — scoped invalidation, cache patch, optimistic send, reconcile

**Files:**
- Modify: `apps/web/src/hooks/use-socket.ts`
- Modify: `apps/web/src/hooks/use-messages.ts`
- Modify: `apps/web/src/hooks/use-conversations.ts`

- [ ] **Step 1: Scoped invalidation + cache patch in use-socket.ts**

- Fix `EVENT_TO_QUERY_KEYS` so `message.received`/`ai.responded` invalidate `['messages']` (prefix-matches `['messages', jid]`) AND `['conversations']` — and drop the dead `['conversation-detail']` gap by relying on `['messages']`.
- In the `nexus-event` handler, before invalidating, handle enriched events:
  - `funnel.changed` with `payload.stage`: `queryClient.setQueryData(['leads'], (old) => patch the lead whose id matches `envelope.jid` to the new stage)`; still invalidate `['conversations']`.
  - `ai.toggled` with `payload.state`: patch the matching conversation list item's `aiState`.
- On `socket.on('connect')`, after the optional `replay`, also `queryClient.invalidateQueries({ queryKey: ['conversations'] })` and `['leads']` to reconcile events missed while disconnected.

- [ ] **Step 2: Optimistic send in use-messages.ts**

Add `onMutate` to `useSendMessage`:

```ts
onMutate: async (text: string) => {
  await qc.cancelQueries({ queryKey: ['messages', jid] });
  const prev = qc.getQueryData<Message[]>(['messages', jid]);
  const optimistic: Message = {
    id: `optimistic-${Date.now()}`, role: 'assistant', content: text, mediaType: 'text', ts: null,
  };
  qc.setQueryData<Message[]>(['messages', jid], (old) => [...(old ?? []), optimistic]);
  return { prev };
},
onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['messages', jid], ctx.prev); },
onSettled: () => { qc.invalidateQueries({ queryKey: ['messages', jid] }); },
```

(Keep the existing `['conversations']` invalidation in `onSettled`.)

- [ ] **Step 3: Poll safety net in use-conversations.ts**

Add `refetchInterval: 45_000` to the `useConversations` query (messages already poll at 10s). If a `useLeads` hook exists, add the same there.

- [ ] **Step 4: Typecheck the web app**

Run: `cd apps/web && npm run lint` (or `npx tsc --noEmit`)
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-socket.ts apps/web/src/hooks/use-messages.ts apps/web/src/hooks/use-conversations.ts
git commit -m "feat(web): scoped invalidation, cache patching, optimistic send, reconcile"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run the whole API suite**

Run: `cd apps/api && npm test`
Expected: all green (existing 14 + new tests).

- [ ] **Step 2: Typecheck both apps**

Run: `cd apps/api && npm run lint` then `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build the API**

Run: `cd apps/api && npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual smoke (optional, requires live Redis + Evolution)**

Use the `/run` or `/verify` skill: send a message from the panel → it appears immediately (optimistic) and persists on refresh; a client message in WhatsApp surfaces within ~1s; advancing the funnel moves the Kanban card without a full refetch.

---

## Risks & Notes

- **Kanban data source:** leads come from Google Sheets, not the conversation index. If the Kanban is empty locally, confirm the test tenant has a populated sheet — that is a data/config issue, not covered by this plan.
- **Kanban `leadId` vs `jid`:** the drag-to-move handler posts to `/conversations/{leadId}/stage`. For the enriched `funnel.changed` patch to match, the lead's `leadId` must equal the conversation `jid`. Verify `SheetsClient` returns `leadId === jid`; if not, that mapping needs a follow-up (out of scope here, flag it).
- **Keyspace loss window:** if the API is down when Redis is written, that event is lost from both pub/sub and the stream. The 45s conversations poll + reconnect reconcile bound the staleness — this is the accepted trade-off of the passive design.
- **pnpm vs npm:** the repo has a `pnpm-store`; use the matching package manager for Task 9's dependency add.
