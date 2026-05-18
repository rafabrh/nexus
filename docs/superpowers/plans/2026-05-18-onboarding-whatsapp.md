# Onboarding WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete WhatsApp onboarding flow — instance creation, QR code scanning, initial history sync, cache layer, and frontend connection page — so each tenant can self-service connect their WhatsApp Business and see real conversations.

**Architecture:** New `OnboardingModule` in the NestJS API handles instance lifecycle (create, QR, sync). Extends `EvolutionClient` with 3 new methods, `WebhookService` with connection state persistence and cache invalidation, `TenantEntry` with connection/sync state. Frontend gets a `/connect` page with QR code display and a `ConnectionGuard` in the app layout. Cache-aside pattern with TTL-layered Redis keys.

**Tech Stack:** NestJS + Fastify, Redis (ioredis), Evolution API v2 REST, Next.js 14, Zustand, TanStack Query

**Spec:** `docs/superpowers/specs/2026-05-18-onboarding-whatsapp-architecture.md`

---

## File Map

### Shared Package (packages/shared/src/)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `types/tenant.ts` | Add `connectionState`, `syncStatus`, `connectedAt`, `n8nWebhookUrl` to `TenantEntry` |
| Modify | `constants/redis-keys.ts` | Add `instanceState()`, `syncStatus()`, `cacheConversations()`, `cacheDashboard()`, `cacheContacts()` |
| Modify | `index.ts` | Export new types (if any new files) |

### Backend — OnboardingModule (apps/api/src/onboarding/)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `onboarding.module.ts` | NestJS module wiring |
| Create | `onboarding.controller.ts` | REST endpoints: state, instance, qr, sync, retry-sync |
| Create | `onboarding.service.ts` | Instance lifecycle: create, check state, coordinate sync |
| Create | `sync.service.ts` | Pull chats+messages from Evolution API, populate Redis |
| Create | `dto/sync-response.dto.ts` | Response shape for sync endpoint |

### Backend — Existing (apps/api/src/)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `whatsapp/evolution.client.ts` | Add `createInstance()`, `getQrCode()`, `deleteInstance()` |
| Modify | `webhook/webhook.service.ts` | Persist `connection.update` state in Redis, invalidate cache keys |
| Modify | `conversation/conversation.service.ts` | Cache-aside for `listConversations()` |
| Modify | `dashboard/dashboard.service.ts` | Cache-aside for `getDashboard()` |
| Modify | `app.module.ts` | Import `OnboardingModule` |

### Frontend (apps/web/src/)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/(app)/connect/page.tsx` | QR code page with polling and state machine |
| Create | `hooks/use-onboarding.ts` | TanStack Query hooks for onboarding endpoints |
| Modify | `app/(app)/layout.tsx` | ConnectionGuard — redirect to /connect if disconnected |
| Modify | `components/layout/top-bar.tsx` | Link Online/Offline badge to /connect when disconnected |

---

## Task 1: Extend Shared Types (TenantEntry + RedisKeys)

**Files:**
- Modify: `packages/shared/src/types/tenant.ts`
- Modify: `packages/shared/src/constants/redis-keys.ts`

- [ ] **Step 1: Add new fields to TenantEntry**

In `packages/shared/src/types/tenant.ts`, add optional fields to `TenantEntry`:

```typescript
export interface TenantEntry {
  instancia: string;
  name: string;
  users: TenantUser[];
  createdAt: string;
  active: boolean;
  // --- New fields ---
  connectionState?: 'created' | 'open' | 'close' | 'connecting';
  syncStatus?: 'pending' | 'syncing' | 'done' | 'error';
  connectedAt?: string;
  n8nWebhookUrl?: string;
}
```

Fields are optional (`?`) for backward compatibility with existing tenant data in Redis.

- [ ] **Step 2: Add new Redis keys**

In `packages/shared/src/constants/redis-keys.ts`, add these keys after the `idempotency` section:

```typescript
  // ---- Onboarding / Instance state ----

  instanceState: (inst: string) =>
    `instanceState:${inst}`,

  syncStatus: (inst: string) =>
    `syncStatus:${inst}`,

  // ---- Cache (TTL-based, invalidated by webhook) ----

  cacheConversations: (inst: string) =>
    `cache:conversations:${inst}`,

  cacheDashboard: (inst: string) =>
    `cache:dashboard:${inst}`,

  cacheContacts: (inst: string) =>
    `cache:contacts:${inst}`,
```

- [ ] **Step 3: Rebuild shared package**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/shared build`
Expected: Clean compile, `packages/shared/dist/` updated.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add onboarding fields to TenantEntry and cache RedisKeys"
```

---

## Task 2: Extend EvolutionClient with Instance Lifecycle Methods

**Files:**
- Modify: `apps/api/src/whatsapp/evolution.client.ts`

- [ ] **Step 1: Add `createInstance()` method**

Add after the `findChats()` method in `evolution.client.ts`:

```typescript
  async createInstance(instanceName: string, webhookUrl?: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    };
    if (webhookUrl) {
      body.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'messages.upsert',
          'connection.update',
          'contacts.update',
          'contacts.upsert',
        ],
      };
    }
    return this.request<Record<string, unknown>>('POST', '/instance/create', body);
  }
```

**Important:** This does NOT set the N8N webhook. The `webhookUrl` here is the NEXUS API webhook (`/api/v1/webhook/evolution`). The N8N webhook is configured separately per tenant by the admin.

- [ ] **Step 2: Add `getQrCode()` method**

```typescript
  async getQrCode(instancia: string): Promise<{ base64: string; code: string }> {
    return this.request<{ base64: string; code: string }>('GET', `/instance/connect/${instancia}`);
  }
```

- [ ] **Step 3: Add `deleteInstance()` method**

```typescript
  async deleteInstance(instancia: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${instancia}`);
  }
```

- [ ] **Step 4: Verify API compiles**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/api lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/whatsapp/evolution.client.ts
git commit -m "feat(evolution): add createInstance, getQrCode, deleteInstance methods"
```

---

## Task 3: Create OnboardingModule (Controller + Service)

**Files:**
- Create: `apps/api/src/onboarding/onboarding.module.ts`
- Create: `apps/api/src/onboarding/onboarding.controller.ts`
- Create: `apps/api/src/onboarding/onboarding.service.ts`
- Create: `apps/api/src/onboarding/dto/sync-response.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/onboarding/dto/sync-response.dto.ts`:

```typescript
export class SyncResponseDto {
  status!: string;
  chatsImported!: number;
  messagesImported!: number;
}
```

- [ ] **Step 2: Create OnboardingService**

Create `apps/api/src/onboarding/onboarding.service.ts`:

```typescript
import { Injectable, Logger, Inject, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { TenantRegistry } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { SyncService } from './sync.service';

export interface OnboardingState {
  instanceExists: boolean;
  connectionState: string | null;
  syncStatus: string | null;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
    private readonly sync: SyncService,
  ) {}

  async getState(instancia: string): Promise<OnboardingState> {
    const [connectionState, syncStatus] = await Promise.all([
      this.redis.get(RedisKeys.instanceState(instancia)),
      this.redis.get(RedisKeys.syncStatus(instancia)),
    ]);

    return {
      instanceExists: connectionState !== null,
      connectionState,
      syncStatus,
    };
  }

  async createInstance(instancia: string): Promise<{ instanceName: string; state: string }> {
    // Check if already exists
    const existing = await this.redis.get(RedisKeys.instanceState(instancia));
    if (existing) {
      throw new ConflictException(`Instancia ${instancia} ja existe`);
    }

    // Build NEXUS webhook URL for this instance
    const appBaseUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:4000');
    const webhookUrl = `${appBaseUrl}/api/v1/webhook/evolution`;

    await this.evolution.createInstance(instancia, webhookUrl);

    // Persist initial state
    await Promise.all([
      this.redis.set(RedisKeys.instanceState(instancia), 'created'),
      this.redis.set(RedisKeys.syncStatus(instancia), 'pending'),
    ]);

    // Update tenant registry
    await this.updateTenantConnectionState(instancia, 'created', 'pending');

    this.logger.log(`onboarding.instance-created instancia=${instancia}`);
    return { instanceName: instancia, state: 'created' };
  }

  async getQrCode(instancia: string): Promise<{ qrCode: string; expiresIn: number }> {
    const result = await this.evolution.getQrCode(instancia);
    this.logger.log(`onboarding.qr-generated instancia=${instancia}`);
    return {
      qrCode: result.base64,
      expiresIn: 40,
    };
  }

  async startSync(instancia: string): Promise<{ status: string; chatsImported: number; messagesImported: number }> {
    const currentSync = await this.redis.get(RedisKeys.syncStatus(instancia));
    if (currentSync === 'syncing') {
      throw new ConflictException('Sync ja em andamento');
    }

    await this.redis.set(RedisKeys.syncStatus(instancia), 'syncing');
    await this.updateTenantConnectionState(instancia, undefined, 'syncing');

    try {
      const result = await this.sync.syncAll(instancia);

      await this.redis.set(RedisKeys.syncStatus(instancia), 'done');
      await this.updateTenantConnectionState(instancia, undefined, 'done');

      this.logger.log(
        `sync.completed instancia=${instancia} chats=${result.chats} messages=${result.messages} durationMs=${result.durationMs}`,
      );

      return {
        status: 'done',
        chatsImported: result.chats,
        messagesImported: result.messages,
      };
    } catch (err) {
      await this.redis.set(RedisKeys.syncStatus(instancia), 'error');
      await this.updateTenantConnectionState(instancia, undefined, 'error');
      this.logger.error(`sync.failed instancia=${instancia}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async updateTenantConnectionState(
    instancia: string,
    connectionState?: string,
    syncStatus?: string,
  ): Promise<void> {
    const raw = await this.redis.get(RedisKeys.tenantRegistry());
    if (!raw) return;

    try {
      const registry: TenantRegistry = JSON.parse(raw);
      const tenant = registry.tenants.find((t) => t.instancia === instancia);
      if (!tenant) return;

      if (connectionState !== undefined) {
        tenant.connectionState = connectionState as any;
      }
      if (syncStatus !== undefined) {
        tenant.syncStatus = syncStatus as any;
      }
      if (connectionState === 'open' && !tenant.connectedAt) {
        tenant.connectedAt = new Date().toISOString();
      }

      registry.version++;
      await this.redis.set(RedisKeys.tenantRegistry(), JSON.stringify(registry));
    } catch {
      this.logger.warn('Failed to update tenant registry connection state');
    }
  }
}
```

- [ ] **Step 3: Create OnboardingController**

Create `apps/api/src/onboarding/onboarding.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { OnboardingService } from './onboarding.service';
import type { OnboardingState } from './onboarding.service';
import type { SyncResponseDto } from './dto/sync-response.dto';

@Controller('onboarding')
@ApiTags('Onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get('state')
  @ApiOperation({ summary: 'Estado atual da instancia (conexao + sync)' })
  async getState(@Tenant() instancia: string): Promise<OnboardingState> {
    return this.service.getState(instancia);
  }

  @Post('instance')
  @Roles('admin')
  @HttpCode(201)
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({ summary: 'Criar instancia na Evolution API' })
  async createInstance(
    @Tenant() instancia: string,
  ): Promise<{ instanceName: string; state: string }> {
    return this.service.createInstance(instancia);
  }

  @Get('qr')
  @Roles('admin')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Gerar/retornar QR code da instancia' })
  async getQrCode(
    @Tenant() instancia: string,
  ): Promise<{ qrCode: string; expiresIn: number }> {
    return this.service.getQrCode(instancia);
  }

  @Post('sync')
  @Roles('admin')
  @HttpCode(200)
  @Throttle({ default: { ttl: 3600000, limit: 1 } })
  @ApiOperation({ summary: 'Disparar sync inicial de chats e mensagens' })
  async startSync(@Tenant() instancia: string): Promise<SyncResponseDto> {
    return this.service.startSync(instancia);
  }

  @Post('retry-sync')
  @Roles('admin')
  @HttpCode(200)
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({ summary: 'Re-executar sync em caso de erro' })
  async retrySync(@Tenant() instancia: string): Promise<SyncResponseDto> {
    return this.service.startSync(instancia);
  }
}
```

- [ ] **Step 4: Create OnboardingModule**

Create `apps/api/src/onboarding/onboarding.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, WhatsAppModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, SyncService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
```

- [ ] **Step 5: Register OnboardingModule in AppModule**

In `apps/api/src/app.module.ts`, add import and register:

```typescript
import { OnboardingModule } from './onboarding/onboarding.module';
```

Add `OnboardingModule` to the `imports` array after `AdminModule`.

- [ ] **Step 6: Verify compilation**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/api lint`
Expected: Will fail because `SyncService` doesn't exist yet. That's OK — we create it in the next task.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/onboarding/ apps/api/src/app.module.ts
git commit -m "feat(onboarding): create OnboardingModule with controller, service, and DTO"
```

---

## Task 4: Create SyncService

**Files:**
- Create: `apps/api/src/onboarding/sync.service.ts`

- [ ] **Step 1: Create SyncService**

Create `apps/api/src/onboarding/sync.service.ts`:

```typescript
import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';

interface SyncResult {
  chats: number;
  messages: number;
  durationMs: number;
}

interface EvolutionChat {
  id?: string;
  remoteJid?: string;
  name?: string;
  [key: string]: unknown;
}

interface EvolutionMessage {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown>;
  messageTimestamp?: number | string;
  pushName?: string;
  [key: string]: unknown;
}

const BATCH_SIZE = 10;
const MAX_MESSAGES_PER_CHAT = 200;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
  ) {}

  async syncAll(instancia: string): Promise<SyncResult> {
    const start = Date.now();
    let totalChats = 0;
    let totalMessages = 0;

    this.logger.log(`sync.started instancia=${instancia}`);

    // 1. Fetch all chats
    const rawChats = await this.evolution.findChats(instancia);
    const chats = Array.isArray(rawChats) ? (rawChats as EvolutionChat[]) : [];

    // Filter to personal chats only (exclude groups, status)
    const personalChats = chats.filter((c) => {
      const jid = c.id || c.remoteJid || '';
      return jid.includes('@s.whatsapp.net');
    });

    this.logger.log(
      `sync.progress instancia=${instancia} phase=chats total=${personalChats.length}`,
    );

    // 2. Process chats in batches
    for (let i = 0; i < personalChats.length; i += BATCH_SIZE) {
      const batch = personalChats.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((chat) => this.syncOneChat(instancia, chat)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalMessages += result.value;
          totalChats++;
        } else {
          this.logger.warn(`sync.chat-failed: ${result.reason}`);
        }
      }

      this.logger.debug(
        `sync.progress instancia=${instancia} phase=messages processed=${Math.min(i + BATCH_SIZE, personalChats.length)}/${personalChats.length}`,
      );
    }

    // 3. Sync contacts
    await this.syncContacts(instancia);

    const durationMs = Date.now() - start;
    return { chats: totalChats, messages: totalMessages, durationMs };
  }

  private async syncOneChat(instancia: string, chat: EvolutionChat): Promise<number> {
    const jid = chat.id || chat.remoteJid || '';
    if (!jid) return 0;

    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);

    // Check if already synced (idempotent)
    const existingLen = await this.redis.llen(histKey);
    if (existingLen > 0) return 0;

    // Fetch messages from Evolution API
    const rawMessages = await this.evolution.findMessages(instancia, jid, MAX_MESSAGES_PER_CHAT);
    const messages = Array.isArray(rawMessages)
      ? (rawMessages as EvolutionMessage[])
      : ((rawMessages as Record<string, unknown>)?.messages as EvolutionMessage[]) ?? [];

    if (messages.length === 0) return 0;

    // Convert to LangChain format and push to Redis
    const pipeline = this.redis.pipeline();
    let count = 0;

    for (const msg of messages) {
      const content = this.extractContent(msg);
      if (!content) continue;

      const type = msg.key?.fromMe ? 'ai' : 'human';
      const entry = JSON.stringify({
        type,
        data: {
          content,
          timestamp: this.extractTimestamp(msg),
        },
      });

      pipeline.rpush(histKey, entry);
      count++;
    }

    // Set initial conversation state (SETNX = don't overwrite if webhook already created it)
    const stateKey = RedisKeys.state(instancia, jid);
    pipeline.set(stateKey, 'active', 'NX' as any);

    const stepKey = RedisKeys.followupStep(instancia, jid);
    pipeline.set(stepKey, 'S0', 'NX' as any);

    // Save contact name from chat
    if (chat.name) {
      const contactKey = RedisKeys.contact(phone);
      pipeline.set(contactKey, JSON.stringify({ pushName: chat.name }));
    }

    await pipeline.exec();
    return count;
  }

  private async syncContacts(instancia: string): Promise<void> {
    try {
      const rawContacts = await this.evolution.findContacts(instancia);
      const contacts = Array.isArray(rawContacts) ? rawContacts : [];

      const pipeline = this.redis.pipeline();
      for (const c of contacts) {
        const contact = c as Record<string, unknown>;
        const jid = contact.id as string || contact.remoteJid as string || '';
        const pushName = contact.pushName as string || contact.notify as string || '';

        if (jid.includes('@s.whatsapp.net') && pushName) {
          const phone = jid.replace('@s.whatsapp.net', '');
          pipeline.set(RedisKeys.contact(phone), JSON.stringify({ pushName }));
        }
      }
      await pipeline.exec();

      this.logger.log(`sync.contacts instancia=${instancia} total=${contacts.length}`);
    } catch (err) {
      this.logger.warn(`sync.contacts-failed instancia=${instancia}: ${(err as Error).message}`);
    }
  }

  private extractContent(msg: EvolutionMessage): string | null {
    const message = msg.message;
    if (!message || typeof message !== 'object') return null;

    if (typeof message.conversation === 'string') return message.conversation;

    const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
    if (ext && typeof ext.text === 'string') return ext.text;

    const img = message.imageMessage as Record<string, unknown> | undefined;
    if (img) return typeof img.caption === 'string' ? img.caption : '[imagem]';

    const vid = message.videoMessage as Record<string, unknown> | undefined;
    if (vid) return typeof vid.caption === 'string' ? vid.caption : '[video]';

    if (message.audioMessage) return '[audio]';

    const doc = message.documentMessage as Record<string, unknown> | undefined;
    if (doc) return typeof doc.fileName === 'string' ? `[doc: ${doc.fileName}]` : '[documento]';

    if (message.stickerMessage) return '[sticker]';
    if (message.locationMessage) return '[localizacao]';
    if (message.contactMessage) return '[contato]';
    if (message.reactionMessage) return null;
    if (message.protocolMessage) return null;

    return '[mensagem]';
  }

  private extractTimestamp(msg: EvolutionMessage): number {
    const ts = msg.messageTimestamp;
    if (!ts) return Date.now();
    const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
    // Evolution returns seconds, we store ms
    return num < 1e12 ? num * 1000 : num;
  }
}
```

- [ ] **Step 2: Verify full compilation**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/shared build && pnpm --filter @nexus/api lint`
Expected: 0 errors. The entire OnboardingModule should compile.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/onboarding/sync.service.ts
git commit -m "feat(onboarding): create SyncService for initial WhatsApp history import"
```

---

## Task 5: Extend WebhookService (Connection State + Cache Invalidation)

**Files:**
- Modify: `apps/api/src/webhook/webhook.service.ts`

- [ ] **Step 1: Update handleConnectionUpdate to persist state**

Replace the existing `handleConnectionUpdate` method (currently just logs) with:

```typescript
  private async handleConnectionUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const dataObj = payload.data;
    if (!dataObj || typeof dataObj !== 'object') return;

    const data = dataObj as Record<string, unknown>;

    // Resolve state from various Evolution API formats
    let state = 'unknown';
    const instanceObj = data.instance as Record<string, unknown> | undefined;
    if (instanceObj && typeof instanceObj.state === 'string') {
      state = instanceObj.state;
    } else if (typeof data.state === 'string') {
      state = data.state;
    }

    // Map to our states
    const mappedState = state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'close';

    // Persist to Redis
    await this.redis.set(RedisKeys.instanceState(instanceName), mappedState);

    // Update tenant registry
    await this.updateTenantConnectionState(instanceName, mappedState);

    this.logger.log(`onboarding.connection-${mappedState} instance=${instanceName}`);
  }
```

- [ ] **Step 2: Add updateTenantConnectionState helper**

Add this private method to `WebhookService`:

```typescript
  private async updateTenantConnectionState(instanceName: string, connectionState: string): Promise<void> {
    const raw = await this.redis.get(RedisKeys.tenantRegistry());
    if (!raw) return;

    try {
      const registry = JSON.parse(raw);
      const tenant = registry.tenants?.find((t: any) => t.instancia === instanceName);
      if (!tenant) return;

      tenant.connectionState = connectionState;
      if (connectionState === 'open' && !tenant.connectedAt) {
        tenant.connectedAt = new Date().toISOString();
      }

      registry.version = (registry.version || 0) + 1;
      await this.redis.set(RedisKeys.tenantRegistry(), JSON.stringify(registry));
    } catch {
      this.logger.warn('Failed to update tenant registry from webhook');
    }
  }
```

- [ ] **Step 3: Add cache invalidation to handleMessageUpsert**

At the end of the `processOneMessage` method (after the `detectAndEmitHot` block), add:

```typescript
    // Invalidate caches for this tenant
    await this.redis.del(RedisKeys.cacheConversations(instanceName));
    await this.redis.del(RedisKeys.cacheDashboard(instanceName));
```

- [ ] **Step 4: Add cache invalidation to handleContactUpdate**

At the end of the `handleContactUpdate` method, after the for loop, add:

```typescript
    // Invalidate contacts cache
    await this.redis.del(RedisKeys.cacheContacts(instanceName));
    await this.redis.del(RedisKeys.cacheConversations(instanceName));
```

- [ ] **Step 5: Update the switch in processEvolutionEvent**

Change `connection.update` from sync to async call (since it now does Redis writes):

In the `switch (event)` block, change:
```typescript
      case 'connection.update':
        this.handleConnectionUpdate(instanceName, payload);
        break;
```
to:
```typescript
      case 'connection.update':
        await this.handleConnectionUpdate(instanceName, payload);
        break;
```

- [ ] **Step 6: Verify compilation**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/api lint`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/webhook/webhook.service.ts
git commit -m "feat(webhook): persist connection state and invalidate cache on events"
```

---

## Task 6: Add Cache-Aside to ConversationService

**Files:**
- Modify: `apps/api/src/conversation/conversation.service.ts`

- [ ] **Step 1: Add cache check and set to listConversations**

Replace the `listConversations` method body with:

```typescript
  async listConversations(
    instancia: string,
    filters: { stage?: string; search?: string; aiState?: string },
  ): Promise<ConversationListItem[]> {
    // Cache-aside: check for cached result (only for unfiltered requests)
    const hasFilters = filters.stage || filters.search || filters.aiState;
    if (!hasFilters) {
      const cached = await this.redis.get(RedisKeys.cacheConversations(instancia));
      if (cached) {
        try {
          return JSON.parse(cached) as ConversationListItem[];
        } catch {
          // Corrupted cache, fall through to rebuild
        }
      }
    }

    // 1. Scan Redis for all JIDs with followup_step
    const jids = await this.repo.findAllJids(instancia);

    // 2. Build ConversationListItem for each JID in parallel
    const conversations = await Promise.all(
      jids.map((jid) => this.repo.buildListItem(instancia, jid)),
    );

    // 3. Sort by lastActivity descending
    const sorted = conversations.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );

    // 4. Cache unfiltered result (TTL 30s)
    if (!hasFilters) {
      await this.redis.set(
        RedisKeys.cacheConversations(instancia),
        JSON.stringify(sorted),
        'EX',
        30,
      );
    }

    // 5. Apply filters (after caching the full list)
    let result = sorted;

    if (filters.stage) {
      result = result.filter((c) => c.stage === filters.stage);
    }

    if (filters.aiState) {
      result = result.filter((c) => c.aiState === filters.aiState);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contactName?.toLowerCase().includes(term) ||
          c.jid.toLowerCase().includes(term),
      );
    }

    return result;
  }
```

- [ ] **Step 2: Verify compilation**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/api lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/conversation/conversation.service.ts
git commit -m "feat(conversations): add cache-aside with 30s TTL for list endpoint"
```

---

## Task 7: Add Cache-Aside to DashboardService

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`

- [ ] **Step 1: Inject Redis and add cache to getDashboard**

Update `apps/api/src/dashboard/dashboard.service.ts`:

Add Redis import and injection:

```typescript
import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { DashboardData } from '@nexus/shared';
import { ConversationRepository } from '../conversation/conversation.repository';
import { SheetsClient } from '../lead/sheets.client';
```

Add `@Inject(REDIS_CLIENT) private readonly redis: Redis` to constructor.

Wrap `getDashboard` with cache:

```typescript
  async getDashboard(instancia: string): Promise<DashboardData> {
    // Cache-aside: check for cached result
    const cached = await this.redis.get(RedisKeys.cacheDashboard(instancia));
    if (cached) {
      try {
        return JSON.parse(cached) as DashboardData;
      } catch {
        // Fall through
      }
    }

    const [jids, leadsData] = await Promise.all([
      this.conversationRepo.findAllJids(instancia),
      this.sheets.getLeadsForDashboard(instancia),
    ]);

    const result: DashboardData = {
      ts: new Date().toISOString(),
      period: 'today',
      leadsNew: leadsData.newToday,
      leadsActive: jids.length,
      leadsQualified: leadsData.qualified,
      leadsPaid: leadsData.paid,
      revenueToday: leadsData.revenueToday,
      revenueCurrency: 'BRL',
      avgResponseMs: 2300,
      handoffCount: leadsData.handoffsToday,
      conversionRate: leadsData.conversionRate,
      topStage: leadsData.topStage,
    };

    // Cache with TTL 60s
    await this.redis.set(RedisKeys.cacheDashboard(instancia), JSON.stringify(result), 'EX', 60);

    return result;
  }
```

- [ ] **Step 2: Verify compilation**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/api lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts
git commit -m "feat(dashboard): add cache-aside with 60s TTL"
```

---

## Task 8: Create Frontend Onboarding Hook

**Files:**
- Create: `apps/web/src/hooks/use-onboarding.ts`

- [ ] **Step 1: Create the hook**

Create `apps/web/src/hooks/use-onboarding.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface OnboardingState {
  instanceExists: boolean;
  connectionState: string | null;
  syncStatus: string | null;
}

interface SyncResult {
  status: string;
  chatsImported: number;
  messagesImported: number;
}

export function useOnboardingState(options?: { refetchInterval?: number }) {
  return useQuery<OnboardingState>({
    queryKey: ['onboarding', 'state'],
    queryFn: () => api('/api/v1/onboarding/state'),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ instanceName: string; state: string }>('/api/v1/onboarding/instance', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });
}

export function useQrCode(enabled: boolean) {
  return useQuery<{ qrCode: string; expiresIn: number }>({
    queryKey: ['onboarding', 'qr'],
    queryFn: () => api('/api/v1/onboarding/qr'),
    enabled,
    refetchInterval: 30_000, // QR expires ~40s, poll every 30s
  });
}

export function useStartSync() {
  const qc = useQueryClient();
  return useMutation<SyncResult>({
    mutationFn: () =>
      api('/api/v1/onboarding/sync', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-onboarding.ts
git commit -m "feat(web): create useOnboarding hooks for onboarding endpoints"
```

---

## Task 9: Create /connect Page (Frontend)

**Files:**
- Create: `apps/web/src/app/(app)/connect/page.tsx`

- [ ] **Step 1: Create the connect page**

Create `apps/web/src/app/(app)/connect/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  useOnboardingState,
  useCreateInstance,
  useQrCode,
  useStartSync,
} from '@/hooks/use-onboarding';

type Phase = 'loading' | 'create' | 'scan' | 'syncing' | 'done' | 'error' | 'reconnect';

function resolvePhase(
  state: { instanceExists: boolean; connectionState: string | null; syncStatus: string | null } | undefined,
  isLoading: boolean,
): Phase {
  if (isLoading || !state) return 'loading';
  if (!state.instanceExists) return 'create';
  if (state.connectionState === 'close') return 'reconnect';
  if (state.connectionState !== 'open') return 'scan';
  if (state.syncStatus === 'syncing') return 'syncing';
  if (state.syncStatus === 'error') return 'error';
  if (state.syncStatus === 'done') return 'done';
  return 'scan';
}

export default function ConnectPage() {
  const router = useRouter();

  const { data: state, isLoading } = useOnboardingState({
    refetchInterval: 3000,
  });

  const phase = resolvePhase(state, isLoading);

  const createInstance = useCreateInstance();
  const startSync = useStartSync();

  const showQr = phase === 'scan' || phase === 'reconnect';
  const { data: qrData } = useQrCode(showQr);

  // Auto-create instance on first visit
  useEffect(() => {
    if (phase === 'create' && !createInstance.isPending) {
      createInstance.mutate();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start sync when connection opens and sync is pending
  useEffect(() => {
    if (
      state?.connectionState === 'open' &&
      state?.syncStatus === 'pending' &&
      !startSync.isPending
    ) {
      startSync.mutate();
    }
  }, [state?.connectionState, state?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect when done
  useEffect(() => {
    if (phase === 'done') {
      const timer = setTimeout(() => router.replace('/conversations'), 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, router]);

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {phase === 'loading' && (
            <PhaseCard key="loading">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
              <p className="text-sm text-text-secondary mt-3">Verificando conexao...</p>
            </PhaseCard>
          )}

          {/* Creating instance */}
          {phase === 'create' && (
            <PhaseCard key="create">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
              <p className="text-sm text-text-secondary mt-3">Criando instancia WhatsApp...</p>
            </PhaseCard>
          )}

          {/* QR Code scan */}
          {(phase === 'scan' || phase === 'reconnect') && (
            <PhaseCard key="scan">
              <QrCode size={32} className="text-primary-400 mx-auto mb-2" />
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                {phase === 'reconnect' ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
              </h2>
              <p className="text-sm text-text-secondary mb-6">
                Abra o WhatsApp no celular, va em Aparelhos conectados e escaneie o codigo abaixo.
              </p>

              {qrData?.qrCode ? (
                <div className="bg-white p-4 rounded-lg mx-auto w-fit">
                  <img
                    src={qrData.qrCode.startsWith('data:') ? qrData.qrCode : `data:image/png;base64,${qrData.qrCode}`}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 mx-auto bg-bg-elevated rounded-lg flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-text-muted" />
                </div>
              )}

              <p className="text-xs text-text-muted mt-4">
                O codigo atualiza automaticamente a cada 30 segundos
              </p>
            </PhaseCard>
          )}

          {/* Syncing */}
          {phase === 'syncing' && (
            <PhaseCard key="syncing">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Sincronizando conversas
              </h2>
              <p className="text-sm text-text-secondary">
                Importando seu historico do WhatsApp. Isso pode levar alguns minutos...
              </p>
            </PhaseCard>
          )}

          {/* Done */}
          {phase === 'done' && (
            <PhaseCard key="done">
              <CheckCircle2 size={40} className="text-success mx-auto" />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Tudo pronto!
              </h2>
              <p className="text-sm text-text-secondary">
                Redirecionando para suas conversas...
              </p>
            </PhaseCard>
          )}

          {/* Error */}
          {phase === 'error' && (
            <PhaseCard key="error">
              <AlertCircle size={40} className="text-error mx-auto" />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Erro na sincronizacao
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                Houve um problema ao importar suas conversas. Tente novamente.
              </p>
              <Button
                onClick={() => startSync.mutate()}
                disabled={startSync.isPending}
              >
                <RefreshCw size={16} className={startSync.isPending ? 'animate-spin' : ''} />
                <span className="ml-2">Tentar novamente</span>
              </Button>
            </PhaseCard>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PhaseCard({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="bg-bg-surface border border-border rounded-modal p-8 text-center"
      {...props}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/connect/page.tsx
git commit -m "feat(web): create /connect page with QR code and onboarding flow"
```

---

## Task 10: Add ConnectionGuard to App Layout

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/components/layout/top-bar.tsx`

- [ ] **Step 1: Add ConnectionGuard to layout**

In `apps/web/src/app/(app)/layout.tsx`, add the connection check inside `AuthGuard`.

Replace the `AuthGuard` component with:

```tsx
function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, setToken } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      api('/api/v1/auth/refresh', { method: 'POST' })
        .then((data: any) => {
          if (data?.accessToken) {
            setToken(data.accessToken);
          } else {
            router.replace('/login');
          }
        })
        .catch(() => {
          router.replace('/login');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <ConnectionGuard pathname={pathname}>{children}</ConnectionGuard>;
}
```

Add the `ConnectionGuard` component:

```tsx
function ConnectionGuard({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Don't check if already on /connect
    if (pathname === '/connect') {
      setChecked(true);
      return;
    }

    api<{ instanceExists: boolean; connectionState: string | null; syncStatus: string | null }>(
      '/api/v1/onboarding/state',
    )
      .then((state) => {
        if (
          !state.instanceExists ||
          state.connectionState !== 'open' ||
          state.syncStatus !== 'done'
        ) {
          router.replace('/connect');
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        setChecked(true); // Don't block on error
      });
  }, [pathname, router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
```

Add missing imports at the top of the file:

```typescript
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
```

- [ ] **Step 2: Link TopBar badge to /connect**

In `apps/web/src/components/layout/top-bar.tsx`, wrap the connection status badge with a Link to `/connect`:

Replace the connection status `<div>` block (lines ~108-122) with:

```tsx
        <Link
          href="/connect"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            connected
              ? 'text-success'
              : 'text-error',
          )}
          style={{
            border: `1px solid ${connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
            background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          }}
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Online' : 'Offline'}
        </Link>
```

(Link is already imported at the top of the file.)

- [ ] **Step 3: Verify frontend compiles**

Run: `cd C:/repositorio/nexus && pnpm --filter @nexus/web build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/layout.tsx apps/web/src/components/layout/top-bar.tsx
git commit -m "feat(web): add ConnectionGuard and link TopBar status to /connect"
```

---

## Task 11: Smoke Test — Full Flow Verification

**Files:** None (manual verification)

- [ ] **Step 1: Rebuild shared and start services**

```bash
cd C:/repositorio/nexus
pnpm --filter @nexus/shared build
pnpm --filter @nexus/api dev &
pnpm --filter @nexus/web dev &
```

Wait for both to be ready.

- [ ] **Step 2: Verify onboarding endpoints**

Test state endpoint (should return `instanceExists: false` for a new tenant):

```bash
# Get a token first by logging in, then:
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/v1/onboarding/state
```

Expected: `{"instanceExists":false,"connectionState":null,"syncStatus":null}`

- [ ] **Step 3: Test full browser flow**

1. Open `http://localhost:3000`
2. Login with magic link
3. Should redirect to `/connect` (ConnectionGuard)
4. Instance creation should auto-trigger
5. QR code should appear
6. Scan with WhatsApp
7. Sync should auto-start
8. Should redirect to `/conversations` with imported data

- [ ] **Step 4: Test returning user flow**

1. Logout and login again
2. Should skip `/connect` entirely and go straight to `/conversations`

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A
git commit -m "fix: smoke test adjustments for onboarding flow"
```

(Only if fixes were needed.)
