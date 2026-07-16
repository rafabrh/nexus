# Respostas rápidas com imagem/vídeo em disco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Respostas rápidas podem anexar imagem ou vídeo guardados em disco persistente (só a referência no Postgres), e usá-las — pelo painel ou pelo dropdown — envia a mídia junto do texto.

**Architecture:** Binário em volume persistente isolado por tenant, atrás de uma interface `MediaStorage` (impl `DiskMediaStorage`). Upload multipart (Fastify) grava o arquivo e devolve uma referência; a linha de `quick_replies` guarda `media_id/type/mimetype/filename/size`. O envio resolve `qrId`→arquivo no servidor e passa à Evolution uma **URL assinada** (HMAC, TTL curto); vídeo > 16 MB vira `document`.

**Tech Stack:** NestJS (Fastify adapter), Drizzle/Postgres, `@fastify/multipart`, Node `crypto` (HMAC), Next.js + React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-quick-reply-media-storage-design.md`

---

## Notas de plataforma (ler antes de começar)

- A API usa **Fastify** (`main.ts` registra `fastifyCookie`). Upload é com **`@fastify/multipart`**, NÃO multer.
- Guard global JWT: toda rota é protegida salvo `@Public()` (ver `webhook.controller.ts:19`). Prefixo global `api/v1` (`main.ts:61`).
- `evolution.sendMedia({ media })` aceita **base64 OU URL** — vamos passar URL assinada.
- Tenant vem de `@Tenant()` (decorator em `auth/decorators/tenant.decorator.ts`).
- `ConfigService` já disponível (`@nestjs/config`). `APP_BASE_URL` já existe (usado em `whatsapp.service.ts`).
- Rodar testes: `cd apps/api && npx vitest run <arquivo>`. Build: `npm run build`. O pacote `@nexus/shared` precisa `npm run build` em `packages/shared` quando o tipo muda.

## Estrutura de arquivos

**API (novos)**
- `apps/api/src/media/media-storage.interface.ts` — interface + token `MEDIA_STORAGE` + tipo `StoredMedia`.
- `apps/api/src/media/disk-media.storage.ts` — impl em disco.
- `apps/api/src/media/media.module.ts` — provider global do storage.
- `apps/api/src/media/media-signature.util.ts` — assinar/verificar URL (HMAC).
- `apps/api/src/media/disk-media.storage.spec.ts`, `media-signature.util.spec.ts` — testes.
- `apps/api/src/quick-replies/public-quick-reply-media.controller.ts` — rota pública assinada.
- `apps/api/src/quick-replies/quick-reply-media.sweeper.ts` — sweep de órfãos.
- `apps/api/drizzle/0003_quick_reply_media.sql` (+ snapshot + `_journal.json`).

**API (modificados)**
- `core/db/schema.ts`, `quick-replies/quick-replies.{controller,service}.ts`,
  `quick-replies/dto/{create,update}-quick-reply.dto.ts`, `quick-replies/quick-replies.module.ts`,
  `conversation/conversation.{controller,service}.ts`, `core/config/app.config.ts` (env),
  `main.ts` (registrar multipart).

**Web (modificados)**
- `hooks/use-quick-replies.ts`, `components/layout/detail-panel.tsx`, `components/chat/message-input.tsx`.

**Shared**
- `packages/shared/src/types/quick-reply.ts`.

---

## Task 1: Config de ambiente

**Files:**
- Modify: `apps/api/src/core/config/app.config.ts`
- Test: `apps/api/src/core/config/app.config.spec.ts`

- [ ] **Step 1: Escrever teste falho** — asserta os defaults novos.

```ts
// dentro do describe existente de app.config
it('expõe defaults de mídia de quick-reply', () => {
  const cfg = loadConfig({}); // ajuste ao helper existente do spec
  expect(cfg.MEDIA_ROOT).toBe('/data/media');
  expect(cfg.QR_MEDIA_MAX_BYTES).toBe(67108864);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd apps/api && npx vitest run src/core/config/app.config.spec.ts` → FAIL.

- [ ] **Step 3: Implementar** — adicionar ao schema/validação de config (seguir o padrão do arquivo):
  `MEDIA_ROOT` (default `/data/media`), `QR_MEDIA_MAX_BYTES` (default `67108864`), `MEDIA_SIGN_SECRET` (string; em prod obrigatório — usar `JWT_SECRET` como fallback se o arquivo já tiver esse padrão, senão exigir). Manter o estilo do arquivo (Joi/zod/manual — usar o que já existe).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(config): env de midia de quick-reply (MEDIA_ROOT, teto, segredo)"`

---

## Task 2: Interface MediaStorage + StoredMedia

**Files:**
- Create: `apps/api/src/media/media-storage.interface.ts`

- [ ] **Step 1: Implementar interface** (sem teste próprio — é contrato):

```ts
import type { Readable } from 'stream';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface StoredMedia {
  id: string;
  mimetype: string;
  size: number;
  filename: string;
}

export interface MediaStorage {
  put(
    instancia: string,
    stream: Readable,
    meta: { mimetype: string; filename: string },
  ): Promise<StoredMedia>;
  createReadStream(instancia: string, mediaId: string): Readable;
  stat(instancia: string, mediaId: string): Promise<{ size: number } | null>;
  delete(instancia: string, mediaId: string): Promise<void>;
  exists(instancia: string, mediaId: string): Promise<boolean>;
}
```

- [ ] **Step 2: Commit** — `git commit -m "feat(media): interface MediaStorage"`

---

## Task 3: DiskMediaStorage

**Files:**
- Create: `apps/api/src/media/disk-media.storage.ts`
- Test: `apps/api/src/media/disk-media.storage.spec.ts`

- [ ] **Step 1: Escrever testes falhos** — usar um `MEDIA_ROOT` temporário (`os.tmpdir()` + uuid).

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'stream';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DiskMediaStorage } from './disk-media.storage';

function fromString(s: string) { return Readable.from(Buffer.from(s)); }

describe('DiskMediaStorage', () => {
  let root: string;
  let storage: DiskMediaStorage;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'media-'));
    storage = new DiskMediaStorage({ get: () => root } as never); // ConfigService stub
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('put grava sob {root}/{inst}/quick-replies e devolve id/size', async () => {
    const r = await storage.put('shk', fromString('hello'), { mimetype: 'image/png', filename: 'a.png' });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.size).toBe(5);
    expect(await storage.exists('shk', r.id)).toBe(true);
  });

  it('isola por tenant — outro tenant não enxerga o mediaId', async () => {
    const r = await storage.put('shk', fromString('x'), { mimetype: 'image/png', filename: 'a.png' });
    expect(await storage.exists('outro', r.id)).toBe(false);
  });

  it('delete remove o arquivo', async () => {
    const r = await storage.put('shk', fromString('x'), { mimetype: 'image/png', filename: 'a.png' });
    await storage.delete('shk', r.id);
    expect(await storage.exists('shk', r.id)).toBe(false);
  });

  it('rejeita mediaId com path traversal', async () => {
    await expect(storage.stat('shk', '../../etc/passwd')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — `randomUUID` para o id; valida `instancia` (sem `/`,`\`,`..`) e `mediaId` (`^[0-9a-f-]{36}$`); `mkdir -p` do diretório do tenant; `createWriteStream` com `pipeline`; conta bytes escritos para `size`.

```ts
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import type { MediaStorage, StoredMedia } from './media-storage.interface';

const MEDIA_ID_RE = /^[0-9a-f-]{36}$/;

@Injectable()
export class DiskMediaStorage implements MediaStorage {
  constructor(private readonly config: ConfigService) {}

  private root() { return this.config.get<string>('MEDIA_ROOT', '/data/media'); }

  private dir(instancia: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(instancia)) throw new BadRequestException('instancia inválida');
    return join(this.root(), instancia, 'quick-replies');
  }

  private path(instancia: string, mediaId: string): string {
    if (!MEDIA_ID_RE.test(mediaId)) throw new BadRequestException('mediaId inválido');
    return join(this.dir(instancia), mediaId);
  }

  async put(instancia: string, stream: Readable, meta: { mimetype: string; filename: string }): Promise<StoredMedia> {
    const id = randomUUID();
    const dir = this.dir(instancia);
    await mkdir(dir, { recursive: true });
    const dest = join(dir, id);
    const ws = createWriteStream(dest);
    await pipeline(stream, ws);
    const s = await stat(dest);
    return { id, mimetype: meta.mimetype, size: s.size, filename: meta.filename };
  }

  createReadStream(instancia: string, mediaId: string): Readable {
    return createReadStream(this.path(instancia, mediaId));
  }

  async stat(instancia: string, mediaId: string): Promise<{ size: number } | null> {
    try { const s = await stat(this.path(instancia, mediaId)); return { size: s.size }; }
    catch { return null; }
  }

  async delete(instancia: string, mediaId: string): Promise<void> {
    try { await unlink(this.path(instancia, mediaId)); } catch { /* já não existe */ }
  }

  async exists(instancia: string, mediaId: string): Promise<boolean> {
    return (await this.stat(instancia, mediaId)) !== null;
  }
}
```

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(media): DiskMediaStorage isolado por tenant"`

---

## Task 4: MediaModule

**Files:**
- Create: `apps/api/src/media/media.module.ts`

- [ ] **Step 1: Implementar** — `@Global()` para injetar em quick-replies e conversation.

```ts
import { Global, Module } from '@nestjs/common';
import { DiskMediaStorage } from './disk-media.storage';
import { MEDIA_STORAGE } from './media-storage.interface';

@Global()
@Module({
  providers: [{ provide: MEDIA_STORAGE, useClass: DiskMediaStorage }],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
```

- [ ] **Step 2: Registrar** em `app.module.ts` (adicionar `MediaModule` aos imports).
- [ ] **Step 3: Build** — `npm run build` → OK.
- [ ] **Step 4: Commit** — `git commit -m "feat(media): MediaModule global"`

---

## Task 5: Assinatura de URL (HMAC)

**Files:**
- Create: `apps/api/src/media/media-signature.util.ts`
- Test: `apps/api/src/media/media-signature.util.spec.ts`

- [ ] **Step 1: Escrever testes falhos.**

```ts
import { describe, it, expect } from 'vitest';
import { signMedia, verifyMedia } from './media-signature.util';

const secret = 'test-secret';

describe('media signature', () => {
  it('assina e verifica um mediaId/inst válido dentro do prazo', () => {
    const { exp, sig } = signMedia('shk', 'id-1', 300, secret);
    expect(verifyMedia('shk', 'id-1', exp, sig, secret)).toBe(true);
  });
  it('rejeita assinatura adulterada', () => {
    const { exp } = signMedia('shk', 'id-1', 300, secret);
    expect(verifyMedia('shk', 'id-1', exp, 'deadbeef', secret)).toBe(false);
  });
  it('rejeita expirada', () => {
    const { sig } = signMedia('shk', 'id-1', -1, secret); // exp no passado
    const exp = Math.floor(Date.now() / 1000) - 1;
    expect(verifyMedia('shk', 'id-1', exp, sig, secret)).toBe(false);
  });
  it('rejeita mediaId trocado', () => {
    const { exp, sig } = signMedia('shk', 'id-1', 300, secret);
    expect(verifyMedia('shk', 'id-2', exp, sig, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — HMAC-SHA256 sobre `inst:mediaId:exp`, comparação `timingSafeEqual`.

```ts
import { createHmac, timingSafeEqual } from 'crypto';

function mac(inst: string, mediaId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${inst}:${mediaId}:${exp}`).digest('hex');
}

export function signMedia(inst: string, mediaId: string, ttlSeconds: number, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: mac(inst, mediaId, exp, secret) };
}

export function verifyMedia(inst: string, mediaId: string, exp: number, sig: string, secret: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = mac(inst, mediaId, exp, secret);
  const a = Buffer.from(expected); const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(media): assinatura HMAC de URL de midia"`

---

## Task 6: Migration do schema + tipo compartilhado

**Files:**
- Modify: `apps/api/src/core/db/schema.ts`, `packages/shared/src/types/quick-reply.ts`
- Create: `apps/api/drizzle/0003_quick_reply_media.sql` (+ snapshot + `_journal.json`)

- [ ] **Step 1: Trocar as colunas em `schema.ts`** — remover `image`/`imageMimetype`, adicionar:

```ts
    // Mídia opcional (imagem/vídeo) guardada em disco; a linha só referencia.
    mediaId: text('media_id'),
    mediaType: text('media_type'),        // image | video
    mediaMimetype: text('media_mimetype'),
    mediaFilename: text('media_filename'),
    mediaSize: integer('media_size'),
```

  Garantir que `integer` está importado de `drizzle-orm/pg-core`.

- [ ] **Step 2: Gerar migration** — `cd apps/api && npx drizzle-kit generate` (ou o script equivalente do projeto — checar `package.json`). Confirmar que `0003_quick_reply_media.sql` dropa `image`/`image_mimetype` e adiciona as 5 colunas. Conferir snapshot e `_journal.json` atualizados.

- [ ] **Step 3: Atualizar o tipo compartilhado.**

```ts
export interface QuickReply {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
  media?: {
    id: string;
    type: 'image' | 'video';
    mimetype: string;
    filename: string;
    size: number;
  };
}
```

- [ ] **Step 4: Rebuild shared** — `cd packages/shared && npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(quick-replies): schema de referencia de midia (0003) + tipo"`

> A API não compila até o Task 7 (o service ainda usa `image`). É esperado; commit mesmo assim (passo atômico de schema).

---

## Task 7: QuickRepliesService generalizado

**Files:**
- Modify: `apps/api/src/quick-replies/quick-replies.service.ts`, `dto/create-quick-reply.dto.ts`, `dto/update-quick-reply.dto.ts`, `quick-replies.controller.ts`
- Test: `apps/api/src/quick-replies/quick-replies.service.spec.ts`

- [ ] **Step 1: Reescrever o spec do service** para o novo modelo. Injeta `MEDIA_STORAGE`. Casos:
  - `create` com `mediaId` que **existe** no disco do tenant → grava o bloco `media`.
  - `create` com `mediaId` **inexistente** → `BadRequestException`.
  - `create` sem mídia → `media` undefined.
  - `update` trocando mídia → apaga o arquivo antigo (mock `storage.delete` chamado com o id antigo).
  - `remove` → chama `storage.delete` com o `mediaId` da linha.
  - `toDto` serializa `media` só quando `mediaId` presente.

  Mockar `storage` (`exists`, `delete`) e `db` no padrão do spec atual do arquivo.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar o service.** Assinaturas novas:

```ts
constructor(
  @Inject(DB) private readonly db: Database,
  @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
) {}

private toDto(row: QuickReplyRow): QuickReply {
  const base = { id: row.id, name: row.name, content: row.content, shortcut: row.shortcut ?? undefined };
  if (row.mediaId && row.mediaType && row.mediaMimetype) {
    return { ...base, media: {
      id: row.mediaId,
      type: row.mediaType as 'image' | 'video',
      mimetype: row.mediaMimetype,
      filename: row.mediaFilename ?? '',
      size: row.mediaSize ?? 0,
    }};
  }
  return base;
}

async create(instancia: string, name: string, content: string, shortcut?: string, media?: MediaRef): Promise<QuickReply> {
  const id = randomUUID();
  if (media && !(await this.storage.exists(instancia, media.id))) {
    throw new BadRequestException('mediaId inexistente para o tenant');
  }
  const [row] = await this.db.insert(quickReplies).values({
    id, instancia, name, content, shortcut: shortcut ?? null,
    mediaId: media?.id ?? null, mediaType: media?.type ?? null,
    mediaMimetype: media?.mimetype ?? null, mediaFilename: media?.filename ?? null,
    mediaSize: media?.size ?? null,
  }).returning();
  return this.toDto(row);
}
```

  `MediaRef = { id; type: 'image'|'video'; mimetype; filename; size }`. No `update`, se vier nova `media`, validar existência, ler a linha atual, gravar a nova ref e chamar `storage.delete(instancia, antigoMediaId)` quando mudou; se vier `media: null`, limpar as colunas e apagar o arquivo. No `remove`, buscar a linha antes de deletar para pegar o `mediaId` e apagar o arquivo (best-effort, log em falha).

- [ ] **Step 4: Atualizar DTOs** — trocar `image`/`imageMimetype` por um objeto `media` opcional validado:

```ts
// create-quick-reply.dto.ts (e update)
class MediaRefDto {
  @IsString() @Matches(/^[0-9a-f-]{36}$/) id!: string;
  @IsIn(['image', 'video']) type!: 'image' | 'video';
  @IsString() @MaxLength(120) mimetype!: string;
  @IsString() @MaxLength(255) filename!: string;
  @IsInt() @Min(0) size!: number;
}
// campo:
@IsOptional() @ValidateNested() @Type(() => MediaRefDto) media?: MediaRefDto;
```

  No update, permitir `media: null` para remover (usar `@ValidateIf`/aceitar null explícito).

- [ ] **Step 5: Ajustar o controller** — passar `dto.media` em vez de `dto.image/imageMimetype`.

- [ ] **Step 6: Rodar spec + build** — `npx vitest run src/quick-replies/quick-replies.service.spec.ts` e `npm run build` → OK.

- [ ] **Step 7: Commit** — `git commit -m "feat(quick-replies): referencia de midia no service + DTOs + ciclo de vida do arquivo"`

---

## Task 8: Upload multipart + serve (preview)

**Files:**
- Modify: `apps/api/src/main.ts` (registrar `@fastify/multipart`), `quick-replies.controller.ts`, `quick-replies.module.ts`
- Test: manual/integração (ver Step 5)

- [ ] **Step 1: Instalar e registrar multipart** — `npm i @fastify/multipart` em `apps/api`. Em `main.ts`, após `fastifyCookie`:

```ts
import fastifyMultipart from '@fastify/multipart';
await app.register(fastifyMultipart, {
  limits: { fileSize: configService.get<number>('QR_MEDIA_MAX_BYTES', 67108864), files: 1 },
});
```

- [ ] **Step 2: Endpoint de upload** em `quick-replies.controller.ts` — `@Roles('admin')`, lê o arquivo do request Fastify, valida mimetype `^(image|video)/`, faz `storage.put` e devolve a referência. Injetar `MEDIA_STORAGE` no controller (ou via service — preferir um método `service.storeUpload`). Acesso ao request Fastify: `@Req() req: FastifyRequest` e `await req.file()`.

```ts
@Post('media')
@Roles('admin')
@ApiOperation({ summary: 'Upload de mídia (imagem/vídeo) para resposta rápida' })
async uploadMedia(@Tenant() instancia: string, @Req() req: FastifyRequest) {
  const file = await (req as any).file();
  if (!file) throw new BadRequestException('arquivo ausente');
  const mimetype: string = file.mimetype ?? '';
  const type = mimetype.startsWith('image/') ? 'image' : mimetype.startsWith('video/') ? 'video' : null;
  if (!type) throw new UnsupportedMediaTypeException('apenas imagem ou vídeo');
  const stored = await this.storage.put(instancia, file.file, { mimetype, filename: file.filename });
  // file.file.truncated indica estouro do limite → 413
  if ((file.file as any).truncated) { await this.storage.delete(instancia, stored.id); throw new PayloadTooLargeException('acima do teto'); }
  return { mediaId: stored.id, mediaType: type, mimetype, filename: stored.filename, size: stored.size };
}
```

  `RolesGuard` precisa estar aplicado no controller (`@UseGuards(JwtAuthGuard, RolesGuard)`); hoje só tem `JwtAuthGuard` — adicionar `RolesGuard` no `@UseGuards`.

- [ ] **Step 3: Endpoint de serve (preview, JWT)** — stream do disco com o mimetype da linha dona.

```ts
@Get('media/:mediaId')
async serveMedia(@Tenant() instancia: string, @Param('mediaId') mediaId: string, @Res() res: FastifyReply) {
  const row = await this.service.findByMediaId(instancia, mediaId); // SELECT ... where media_id + instancia
  if (!row) throw new NotFoundException();
  res.header('Content-Type', row.mediaMimetype ?? 'application/octet-stream');
  res.header('Cache-Control', 'private, max-age=300');
  return res.send(this.storage.createReadStream(instancia, mediaId));
}
```

  Adicionar `findByMediaId` ao service.

- [ ] **Step 4: Build** — `npm run build` → OK.

- [ ] **Step 5: Verificação manual** — subir a API local, obter JWT de admin, `curl -F file=@sample.png .../api/v1/quick-replies/media` → 200 com `mediaId`; `GET .../quick-replies/media/<id>` após criar um qr com essa ref → devolve os bytes. Registrar o resultado.

- [ ] **Step 6: Commit** — `git commit -m "feat(quick-replies): upload multipart + serve de preview"`

---

## Task 9: Rota pública assinada (Evolution busca)

**Files:**
- Create: `apps/api/src/quick-replies/public-quick-reply-media.controller.ts`
- Modify: `quick-replies.module.ts` (registrar o controller)
- Test: `apps/api/src/quick-replies/public-quick-reply-media.controller.spec.ts`

- [ ] **Step 1: Escrever teste falho** — verifica 200 com assinatura válida e 403 com inválida/expirada (mock storage + config).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — `@Public()`, sem JWT; valida assinatura antes de servir.

```ts
@Public()
@Controller('public/qr-media')
export class PublicQuickReplyMediaController {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly config: ConfigService,
  ) {}

  @Get(':mediaId')
  async serve(
    @Param('mediaId') mediaId: string,
    @Query('inst') inst: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: FastifyReply,
  ) {
    const secret = this.config.getOrThrow<string>('MEDIA_SIGN_SECRET');
    if (!verifyMedia(inst, mediaId, Number(exp), sig, secret)) throw new ForbiddenException();
    if (!(await this.storage.exists(inst, mediaId))) throw new NotFoundException();
    res.header('Cache-Control', 'no-store');
    return res.send(this.storage.createReadStream(inst, mediaId));
  }
}
```

- [ ] **Step 4: Rodar e ver passar + build.**
- [ ] **Step 5: Commit** — `git commit -m "feat(quick-replies): rota publica assinada de midia"`

---

## Task 10: Envio via send-quick-reply

**Files:**
- Modify: `apps/api/src/conversation/conversation.controller.ts`, `conversation.service.ts`
- Test: `apps/api/src/conversation/conversation.service.spec.ts` (novo caso) — ou spec dedicado.

- [ ] **Step 1: Escrever teste falho** para a decisão vídeo-vs-documento e a URL assinada:
  - qr `video` com `size = 20MB` → `evolution.sendMedia` chamado com `mediatype: 'document'` e `fileName`.
  - qr `video` com `size = 5MB` → `mediatype: 'video'`.
  - qr `image` → `mediatype: 'image'`.
  - o `media` passado à Evolution é uma URL contendo `sig=` e `exp=` (não base64).
  - caption = `content` do qr.

  Mockar `quickRepliesService.get(instancia, qrId)`, `evolution.sendMedia`, `config` (`MEDIA_SIGN_SECRET`, `APP_BASE_URL`).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `sendQuickReply`** em `conversation.service.ts`:

```ts
async sendQuickReply(instancia: string, jid: string, qrId: string): Promise<{ message: string }> {
  const qr = await this.quickReplies.getOwned(instancia, qrId); // 404 se não for do tenant
  if (!qr.media) {
    // sem mídia: envia texto (reaproveita sendText)
    return this.sendTextMessage(instancia, jid, qr.content);
  }
  const secret = this.config.getOrThrow<string>('MEDIA_SIGN_SECRET');
  const base = this.config.get<string>('APP_BASE_URL', 'http://localhost:4000');
  const { exp, sig } = signMedia(instancia, qr.media.id, 300, secret);
  const url = `${base}/api/v1/public/qr-media/${qr.media.id}?inst=${encodeURIComponent(instancia)}&exp=${exp}&sig=${sig}`;
  const OVER_16MB = qr.media.size > 16 * 1024 * 1024;
  const mediatype = qr.media.type === 'video' && OVER_16MB ? 'document' : qr.media.type;
  await this.sendMediaMessage(instancia, jid, {
    mediatype, media: url, caption: qr.content || undefined,
    mimetype: qr.media.mimetype, fileName: qr.media.filename,
  });
  return { message: 'Resposta rápida enviada' };
}
```

  Adicionar `getOwned` ao `QuickRepliesService` (SELECT por id+instancia, 404 se ausente). Injetar `QuickRepliesService` e `ConfigService` no `ConversationService` (checar dependência circular entre módulos; se houver, mover `getOwned` para um método simples ou expor via `QuickRepliesModule` exportando o service).

- [ ] **Step 4: Endpoint** em `conversation.controller.ts`:

```ts
@Post(':jid/send-quick-reply/:qrId')
@ApiOperation({ summary: 'Envia uma resposta rápida (com mídia, se houver) direto' })
async sendQuickReply(@Tenant() i: string, @Param('jid') jid: string, @Param('qrId') qrId: string) {
  return this.service.sendQuickReply(i, jid, qrId);
}
```

- [ ] **Step 5: Rodar spec + build.**
- [ ] **Step 6: Commit** — `git commit -m "feat(conversation): send-quick-reply com URL assinada e fallback documento"`

---

## Task 11: Sweep de órfãos

**Files:**
- Create: `apps/api/src/quick-replies/quick-reply-media.sweeper.ts`
- Modify: `quick-replies.module.ts`
- Test: `apps/api/src/quick-replies/quick-reply-media.sweeper.spec.ts`

- [ ] **Step 1: Escrever teste falho** — dado um diretório com um arquivo antigo (>24h) sem linha correspondente e um recém-criado, o sweep apaga só o órfão antigo. (Mock storage/listagem + `db.select` dos `media_id` vigentes.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — método `sweep()` que lista arquivos por tenant, cruza com os `media_id` em uso (SELECT distinct) e apaga os que não estão em uso e têm `mtime` > TTL (24h). Disparar via `@Interval` (`@nestjs/schedule`, se já usado no projeto — checar) ou no boot com throttle. Manter fora do caminho crítico.

- [ ] **Step 4: Rodar e ver passar + build.**
- [ ] **Step 5: Commit** — `git commit -m "feat(quick-replies): sweep de midia orfa"`

---

## Task 12: Frontend — hook de upload + envio

**Files:**
- Modify: `apps/web/src/hooks/use-quick-replies.ts`

- [ ] **Step 1: Implementar** — trocar `image/imageMimetype` por `media` na tipagem das mutations; adicionar:
  - `useUploadQuickReplyMedia()` — `POST /api/v1/quick-replies/media` com `FormData` (multipart), devolve `{ mediaId, mediaType, mimetype, filename, size }`. Usar `fetch` direto (o helper `api()` provavelmente força JSON — checar; se sim, não setar `Content-Type` para o browser montar o boundary).
  - `useSendQuickReply(jid)` — `POST /api/v1/conversations/:jid/send-quick-reply/:qrId`, invalida `['messages', jid]` e `['conversations']`.
- [ ] **Step 2: Build web** — `cd apps/web && npm run build` → OK.
- [ ] **Step 3: Commit** — `git commit -m "feat(web): hooks de upload e envio de midia de quick-reply"`

---

## Task 13: Frontend — painel (criar com imagem/vídeo + envio direto)

**Files:**
- Modify: `apps/web/src/components/layout/detail-panel.tsx`

- [ ] **Step 1: Trocar o estado da mídia** — de `{ base64, mimetype, preview }` para `{ mediaId, mediaType, mimetype, filename, size, preview } | null`. `handleQrImagePick` vira `handleQrMediaPick`: `accept="image/*,video/*"`, valida tipo, teto 64 MB, **sobe o arquivo** via `useUploadQuickReplyMedia` (mostra estado "enviando…"), guarda a referência + gera `preview` (imagem: `URL.createObjectURL`; vídeo: ícone/thumb). `handleAddQuickReply` passa `media: { id, type, mimetype, filename, size }` (ou omite).
- [ ] **Step 2: Preview** — imagem via `<img>`, vídeo via `<video muted>` ou ícone de vídeo + nome do arquivo. Botão de remover limpa o estado (arquivo vira órfão → sweep cuida).
- [ ] **Step 3: Envio direto pelo painel** — na lista de respostas rápidas, o clique passa a: se `qr.media` existir, `useSendQuickReply(jid).mutate(qr.id)` (envio direto); senão, `insertIntoComposer(qr.content)` (comportamento atual). Miniatura usa `GET /quick-replies/media/:mediaId` (com credencial). Ícone: imagem vs vídeo.
- [ ] **Step 4: Build web** — OK.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): painel cria/usa resposta rapida com imagem ou video"`

---

## Task 14: Frontend — dropdown do composer

**Files:**
- Modify: `apps/web/src/components/chat/message-input.tsx`

- [ ] **Step 1: Simplificar `handleQuickReply`** — usar `useSendQuickReply(jid)` para TODOS os casos (o servidor decide texto vs mídia). Remover a lógica antiga de `sendMedia` com base64/`qr.image`. Miniatura do dropdown usa a rota de serve em vez de `data:base64`.
- [ ] **Step 2: Build web** — OK.
- [ ] **Step 3: Commit** — `git commit -m "feat(web): dropdown usa send-quick-reply (servidor resolve midia)"`

---

## Task 15: Validação final

- [ ] **Step 1: Build monorepo** — `packages/shared` → `apps/api` → `apps/web`, todos OK.
- [ ] **Step 2: Suíte API** — `cd apps/api && npm test` → tudo verde.
- [ ] **Step 3: Verificação manual e2e** (registrar resultados):
  - Criar resposta rápida com **imagem** pelo painel → miniatura aparece.
  - Criar com **vídeo pequeno** (<16MB) → enviar pelo painel → chega como vídeo tocável.
  - Criar com **vídeo grande** (>16MB) → enviar → chega como documento baixável.
  - Enviar pelo **dropdown** → mesma mídia.
  - Deletar a resposta rápida → arquivo some do disco.
  - Conferir que a rota pública recusa `sig` inválida/expirada (403).
- [ ] **Step 4: Commit final se houver ajustes** e encerrar.

---

## Riscos e pontos de atenção

- **Dependência circular** `ConversationModule` ↔ `QuickRepliesModule` (Task 10): se surgir, exportar o `QuickRepliesService` do seu módulo e importar o módulo (não o provider solto), ou usar `forwardRef`. Preferir exportar o service.
- **`api()` helper e multipart** (Task 12): não deixar o helper forçar `Content-Type: application/json` no upload — o browser precisa montar o boundary.
- **`MEDIA_SIGN_SECRET` em prod**: obrigatório; sem ele o envio de mídia falha. Documentar no deploy (EasyPanel env).
- **`APP_BASE_URL` acessível pela Evolution**: a URL assinada precisa ser alcançável a partir do host da Evolution. Em prod é a URL pública; validar no ambiente EasyPanel.
- **`@nestjs/schedule`** (Task 11): se não estiver no projeto, instalar ou disparar o sweep por outro mecanismo já existente.
- **Volume persistente** no EasyPanel montado em `MEDIA_ROOT` — sem o volume, a mídia some no rebuild.
```
