# Tiering do Redis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manter só a cauda quente do `chathistory` no Redis (LTRIM) e arquivar o histórico completo no Postgres como projeção durável, com leitura tiered — destravando ~5M threads sem estourar a memória do Redis.

**Architecture:** O keyspace listener (`apps/api/src/realtime/keyspace.listener.ts`) já dispara em TODO `rpush` de `chathistory:*` (inclusive escrito pelo N8N). Enganchamos aí um **archiver write-behind** (idempotente) que espelha a cauda no Postgres. O LTRIM da lista é feito por um **script Lua atômico** que **arquiva a cabeça a ser removida na MESMA operação** — assim nada é aparado sem estar no Postgres, mesmo com o canal keyspace sendo lossy. A leitura (`ConversationRepository`) lê a cauda do Redis e, para páginas mais antigas, cai no Postgres. Um backfill único popula o histórico existente antes de ligar o LTRIM em produção (flag).

**Tech Stack:** NestJS, Drizzle (postgres-js), ioredis, Vitest. Migrations aplicadas no boot via `drizzle-orm/postgres-js/migrator` (`main.ts:47`, pasta `apps/api/drizzle/`).

**Invariantes (não quebrar):**
- Caminho quente de mensagem NÃO passa síncrono pelo Postgres (container 256MB; `db.module.ts`). Archive é write-behind, fora da request, e **coalescido por conversa** (Task 5) para não saturar o pool de 10 conexões em escala.
- **O LTRIM só remove o que já está arquivado.** Garantido por construção: o script Lua lê a cabeça a aparar e a devolve para archive ANTES/na mesma execução do trim (Task 4). Não dependemos de o evento keyspace anterior ter arquivado (keyspace é lossy — ver `use-messages.ts`).
- `LTRIM` NÃO causa loop: `event.translator.ts:19` ignora operações != rpush/lpush/set, então o evento de ltrim não vira `message.received`. **(Confirmado no review.)**
- Idempotência do archive por chave `(instancia, jid, msgId)`. `msgId = parsed.id || media.id || 'legacy-'+sha1(rawJson)`. **Nunca** usar índice relativo à janela na chave sintética (janelas diferem entre incremental e backfill → duplicaria). O hash é do JSON cru inteiro: estável entre caminhos; entradas byte-idênticas colapsam (aceito e documentado).

**Derivação de chave (não é bug — validado no review):** `phone = jid.replace('@s.whatsapp.net','')` recupera o `id` original em TODOS os casos (`@lid`, `@g.us`, normal), porque o único sufixo que o `event.translator.ts:32` adiciona é `@s.whatsapp.net`, e só quando não há `@`. O `getMessages` de produção (`conversation.repository.ts:201`) já usa isso. Para DRY, extrair `phoneFromJid(jid)` num util compartilhado e usar nos dois lugares.

**Config (env):**
- `CHATHISTORY_ARCHIVE_ENABLED` (default `false`) — liga o archive incremental (keyspace). **Deve ficar OFF até o backfill terminar** (garante ordem cronológica do `seq` — ver abaixo).
- `CHATHISTORY_HOT_CAP` (default `300`) — tamanho da cauda mantida no Redis.
- `CHATHISTORY_LTRIM_ENABLED` (default `false`) — liga o LTRIM só após o backfill validado.
- `CHATHISTORY_ARCHIVE_THROTTLE_SEC` (default `5`) — coalescing do archive por conversa.

**Ordem do `seq` (correção do 2º review):** `seq` (bigserial) reflete ordem de INSERÇÃO no Postgres, que só é igual à ordem cronológica da lista Redis **se o backfill (lista inteira, em ordem) rodar ANTES do archive incremental** (que só vê a cauda). Se o incremental rodasse antes, a cauda ganharia `seq` baixo e a cabeça (via backfill posterior) `seq` alto → ordem invertida. Por isso `CHATHISTORY_ARCHIVE_ENABLED` começa OFF e o runbook faz **backfill → depois liga o incremental**. Não é "cronológico por construção"; é cronológico **por sequência de rollout**.

**Nota de commit:** `apps/api/**` NÃO está no `.gitignore` (só `docs/` está). Usar `git add` normal para código; `git add -f` **apenas** para arquivos sob `docs/`.

---

## Resolução do review (contexto p/ o executor)

Este plano já incorpora o review multi-agente. Resumo:
- 🔴 **Corrida/perda no LTRIM** → resolvido com **script Lua atômico** que arquiva a cabeça a ser aparada (Task 4). Teste dedicado incluído.
- 🔴 **`ts` NULL quebrava paginação** → ordenação/paginação fria passa a usar coluna **`seq` (bigserial)**, não `ts`. `ts` fica só para exibição (Task 1/3).
- 🔴 **`jid→phone` com `@lid`** → **rejeitado** (falso-positivo; ver "Derivação de chave" acima). Mantido, com helper DRY.
- 🟡 **chave sintética instável** → `legacy-sha1(rawJson)`, sem índice relativo (Task 1/2).
- 🟡 **`upsertMany` não atualiza ACK** → renomeado `insertManyIdempotent`; cold history não rastreia ACK ao vivo (YAGNI, documentado) (Task 3).
- 🟡 **validação do backfill por `llen`** → validar por WAMIDs amostrados, não contagem crua (runbook).
- 🟢 **`parseHistoryEntry`** → tarefa dedicada com testes de caracterização ANTES do reuso (Task 2).
- 🟢 **pressão de escrita** → coalescing por conversa (Task 5).
- 🟢 **`lint`=`tsc --noEmit`** confirmado (`apps/api/package.json`); comando válido como typecheck.

**2ª iteração do review** (novo achado, corrigido aqui): `seq` NÃO é cronológico se o incremental rodar antes do backfill (cauda ganha seq baixo, cabeça do backfill ganha seq alto → invertido). Corrigido por **rollout: backfill antes do incremental**, via flag `CHATHISTORY_ARCHIVE_ENABLED` (default OFF) + runbook reordenado + texto do schema corrigido. Gate de coalescing agora explicitado envolvendo o `archiveTail` inteiro. Review aprovou liberar com essas correções de texto/rollout (sem retrabalho de código).

---

## File Structure

- **Modify** `apps/api/src/core/db/schema.ts` — nova tabela `messages` (projeção durável).
- **Create** migration em `apps/api/drizzle/` (via `drizzle-kit generate`).
- **Create** `apps/api/src/conversation/parse-history-entry.ts` (+ `.spec.ts`) — util DRY de parse de UMA entrada + `phoneFromJid`.
- **Create** `apps/api/src/conversation/message-archive.repository.ts` (+ `.spec.ts`) — insert idempotente + página fria por `seq`.
- **Create** `apps/api/src/conversation/message-archive.service.ts` (+ `.spec.ts`) — archive coalescido + LTRIM atômico via Lua.
- **Modify** `apps/api/src/realtime/keyspace.listener.ts` — disparar archive em `message.received`.
- **Modify** `apps/api/src/conversation/conversation.repository.ts` (+ `.spec.ts`) — leitura tiered + `getMessagesPage`.
- **Create** `apps/api/src/conversation/chathistory-backfill.command.ts` (+ `.spec.ts`) — backfill único idempotente.

---

## Task 1: Tabela `messages` (projeção durável)

**Files:** Modify `apps/api/src/core/db/schema.ts`; Create migration em `apps/api/drizzle/`.

- [ ] **Step 1: Adicionar a tabela ao schema**

```ts
import { bigserial } from 'drizzle-orm/pg-core'; // adicionar ao import existente

// ---- Messages (projeção durável/archive do chathistory Redis; N8N+BFF escrevem o Redis) ----
// Fonte quente = lista Redis chathistory:{inst}-{phone}; esta tabela é o arquivo
// frio COMPLETO. Dedup = (instancia, jid, msgId). Ordenação/paginação = `seq`
// (bigserial, ordem de INSERÇÃO), NÃO `ts` (nullable). O `seq` só é cronológico
// se o BACKFILL preceder o archive incremental — garantido pelo runbook (flag
// CHATHISTORY_ARCHIVE_ENABLED). Ver "Ordem do seq" no topo do plano.
// Cold history NÃO rastreia ACK/status ao vivo (YAGNI) — status vem da leitura quente.
export const messages = pgTable(
  'messages',
  {
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    instancia: text('instancia').notNull(),
    jid: text('jid').notNull(),
    msgId: text('msg_id').notNull(),
    fromMe: boolean('from_me').notNull().default(false),
    type: text('type'),
    content: text('content'),
    mediaKind: text('media_kind'),
    mediaId: text('media_id'),
    mediaMimetype: text('media_mimetype'),
    quoted: jsonb('quoted').$type<{ id: string; preview: string; fromMe: boolean } | null>(),
    ts: timestamp('ts', { withTimezone: true }), // só exibição; pode ser NULL em legados
    raw: jsonb('raw').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.instancia, t.jid, t.msgId] }),
    // Paginação fria estável e não-nula por ordem de inserção.
    byConversationSeq: index('ix_msg_conv_seq').on(t.instancia, t.jid, t.seq),
  }),
);

export type MessageRow = typeof messages.$inferSelect;
```

- [ ] **Step 2: Gerar a migration**

Run: `npm run db:generate --prefix apps/api`
Expected: novo `.sql` em `apps/api/drizzle/` + entrada no `_journal.json`. **Conferir o `journal`** (gotcha conhecido — ordem cronológica).

- [ ] **Step 3: Typecheck**

Run: `npm run lint --prefix apps/api` (é `tsc --noEmit`)
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add apps/api/src/core/db/schema.ts apps/api/drizzle/
git commit -m "feat(db): tabela messages (archive durável do chathistory, ordenada por seq)"
```

---

## Task 2: Util `parseHistoryEntry` + `phoneFromJid` (DRY, com testes de caracterização)

**Files:** Create `apps/api/src/conversation/parse-history-entry.ts` (+ `.spec.ts`).

Extrai o parse de UMA entrada crua do chathistory (hoje embutido em `getMessages`, `conversation.repository.ts:221-256`). O **dedup por WAMID permanece no chamador** (é um loop, não por-entrada). Faça primeiro os testes de caracterização, garantindo saída idêntica ao parse atual.

- [ ] **Step 1: Testes de caracterização (devem falhar)**

```ts
import { parseHistoryEntry, phoneFromJid } from './parse-history-entry';

describe('phoneFromJid', () => {
  it('normal → dígitos', () => expect(phoneFromJid('5511@s.whatsapp.net')).toBe('5511'));
  it('@lid → inalterado', () => expect(phoneFromJid('262246@lid')).toBe('262246@lid'));
  it('@g.us → inalterado', () => expect(phoneFromJid('123@g.us')).toBe('123@g.us'));
});

describe('parseHistoryEntry', () => {
  it('mensagem de saída (type ai) com id real', () => {
    const e = parseHistoryEntry(JSON.stringify({ id: 'WAMID1', type: 'ai', data: { content: 'oi', timestamp: 1700000000000 } }));
    expect(e).toMatchObject({ msgId: 'WAMID1', type: 'ai', content: 'oi', fromMe: true });
    expect(e!.ts).toBeInstanceOf(Date);
  });
  it('mídia usa media.id como msgId quando não há id de topo', () => {
    const e = parseHistoryEntry(JSON.stringify({ media: { id: 'M1', kind: 'image', mimetype: 'image/jpeg' } }));
    expect(e).toMatchObject({ msgId: 'M1', mediaKind: 'image', mediaId: 'M1' });
  });
  it('quoted preservado', () => {
    const e = parseHistoryEntry(JSON.stringify({ id: 'W', quoted: { id: 'q', preview: 'p', fromMe: true } }));
    expect(e!.quoted).toEqual({ id: 'q', preview: 'p', fromMe: true });
  });
  it('legado sem id → msgId sintético estável por sha1(raw)', () => {
    const raw = JSON.stringify({ data: { content: 'x' } });
    expect(parseHistoryEntry(raw)!.msgId).toBe(parseHistoryEntry(raw)!.msgId); // determinístico
    expect(parseHistoryEntry(raw)!.msgId.startsWith('legacy-')).toBe(true);
  });
  it('malformada → null', () => expect(parseHistoryEntry('{invalid')).toBeNull());
});
```

- [ ] **Step 2: Rodar (deve falhar)** — Run: `npm test --prefix apps/api -- parse-history-entry` → FAIL.

- [ ] **Step 3: Implementar o util** (espelhar exatamente o parse de `getMessages`; `ts` de `data.timestamp` number; `fromMe`/`type` de `parsed.type === 'ai'`; `msgId = parsed.id || media?.id || 'legacy-'+sha1(raw)`).

- [ ] **Step 4: Rodar (deve passar)** — Run: `npm test --prefix apps/api -- parse-history-entry` → PASS.

- [ ] **Step 5: Refatorar `getMessages` para usar o util** (sem mudar comportamento; o dedup por WAMID e o `slice(-limit)` continuam no método). Rodar a suite do repositório: `npm test --prefix apps/api -- conversation.repository` → PASS (caracterização preservada).

- [ ] **Step 6: Commit**

```
git add apps/api/src/conversation/parse-history-entry.ts apps/api/src/conversation/parse-history-entry.spec.ts apps/api/src/conversation/conversation.repository.ts
git commit -m "refactor(conversation): extrai parseHistoryEntry + phoneFromJid (DRY, caracterizado)"
```

---

## Task 3: `MessageArchiveRepository` — insert idempotente + página fria por `seq`

**Files:** Create `apps/api/src/conversation/message-archive.repository.ts` (+ `.spec.ts`).

- [ ] **Step 1: Testes que falham**

```ts
it('insertManyIdempotent do mesmo msgId duas vezes grava UMA linha', async () => { /* ... */ });
it('readPage por seq retorna anteriores ao cursor em ordem cronológica', async () => {
  // insere m0,m1,m2 (seq crescente); readPage(beforeSeq = seq(m2)) → [m0, m1]
});
it('readPage sem cursor devolve as últimas N por seq desc, reordenadas asc', async () => {});
```

- [ ] **Step 2: Rodar (deve falhar)** — `npm test --prefix apps/api -- message-archive.repository` → FAIL.

- [ ] **Step 3: Implementar**

```ts
@Injectable()
export class MessageArchiveRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** INSERT ... ON CONFLICT (instancia,jid,msgId) DO NOTHING. NÃO atualiza ACK
   * (cold history não rastreia status ao vivo — decisão YAGNI). */
  async insertManyIdempotent(instancia: string, jid: string, entries: ArchiveEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(messages)
      .values(entries.map((e) => ({ instancia, jid, ...e })))
      .onConflictDoNothing({ target: [messages.instancia, messages.jid, messages.msgId] });
  }

  /** Página fria por `seq` (estável, não-nula). `beforeSeq` pagina para trás. */
  async readPage(instancia: string, jid: string, opts: { beforeSeq?: number; limit: number }): Promise<MessageRow[]> {
    const conds = [eq(messages.instancia, instancia), eq(messages.jid, jid)];
    if (opts.beforeSeq != null) conds.push(lt(messages.seq, opts.beforeSeq));
    const rows = await this.db.select().from(messages).where(and(...conds))
      .orderBy(desc(messages.seq)).limit(opts.limit);
    return rows.reverse();
  }

  /** Resolve o `seq` de um msgId (fronteira quente→frio para a paginação). */
  async seqOf(instancia: string, jid: string, msgId: string): Promise<number | null> {
    const [row] = await this.db.select({ seq: messages.seq }).from(messages)
      .where(and(eq(messages.instancia, instancia), eq(messages.jid, jid), eq(messages.msgId, msgId))).limit(1);
    return row?.seq ?? null;
  }
}
```

- [ ] **Step 4: Rodar (deve passar)** → PASS.

- [ ] **Step 5: Commit**

```
git add apps/api/src/conversation/message-archive.repository.ts apps/api/src/conversation/message-archive.repository.spec.ts
git commit -m "feat(conversation): MessageArchiveRepository (insert idempotente + página por seq)"
```

---

## Task 4: `MessageArchiveService` — archive + LTRIM atômico (Lua)

**Files:** Create `apps/api/src/conversation/message-archive.service.ts` (+ `.spec.ts`).

**Correção do review (Crítico 1):** o LTRIM não pode ser `ltrim -cap -1` cego (perde a cabeça não arquivada com keyspace lossy). Usamos um **script Lua atômico** que, quando `llen > cap`, lê a cabeça a remover, a devolve, e apara — tudo numa execução (Redis single-thread ⇒ sem corrida com `rpush` do N8N):

```lua
-- KEYS[1]=histKey ARGV[1]=cap
local len = redis.call('LLEN', KEYS[1])
local cap = tonumber(ARGV[1])
if len <= cap then return {} end
local head = redis.call('LRANGE', KEYS[1], 0, len - cap - 1)  -- a ser removida
redis.call('LTRIM', KEYS[1], len - cap, -1)                   -- mantém a cauda
return head                                                    -- p/ archive garantido
```

- [ ] **Step 1: Testes que falham**

```ts
it('archiveTail arquiva a cauda (write-behind) sempre', async () => { /* upsert chamado */ });
it('com LTRIM ligado e lista > cap: Lua devolve a cabeça e ela é ARQUIVADA antes de sumir', async () => {
  // fakeRedis com 500 entradas, cap 300 → head(200) arquivada + lista fica com 300
});
it('com LTRIM ligado e lista <= cap: não apara', async () => {});
it('com LTRIM desligado: nunca apara', async () => {});
it('rpush concorrente durante o ciclo não perde msg (a cabeça devolvida pela Lua == a removida)', async () => {
  // simula que o script Lua é a única fonte da verdade do que foi removido
});
```

- [ ] **Step 2: Rodar (deve falhar)** → FAIL.

- [ ] **Step 3: Implementar**

```ts
async archiveTail(instancia: string, jid: string): Promise<void> {
  const histKey = RedisKeys.chatHistory(instancia, phoneFromJid(jid));

  // (1) Archive write-behind da cauda — cobre a leitura fria antes de qualquer trim.
  const tail = await this.redis.lrange(histKey, -(this.hotCap + 50), -1);
  await this.archive.insertManyIdempotent(instancia, jid, this.toEntries(tail));

  // (2) LTRIM atômico: a cabeça removida é devolvida e ARQUIVADA (garantia anti-perda).
  if (this.ltrimEnabled) {
    const head: string[] = await this.redis.eval(TRIM_LUA, 1, histKey, String(this.hotCap)) as string[];
    if (head.length > 0) await this.archive.insertManyIdempotent(instancia, jid, this.toEntries(head));
  }
}
// toEntries = map(parseHistoryEntry) filtrando null
```

Registrar o script via `redis.defineCommand`/`eval`. A folga `+50` no passo (1) é só otimização de frescor da cauda; a **garantia** vem do passo (2) (a cabeça arquivada é exatamente a removida).

- [ ] **Step 4: Rodar (deve passar)** → PASS.

- [ ] **Step 5: Commit**

```
git add apps/api/src/conversation/message-archive.service.ts apps/api/src/conversation/message-archive.service.spec.ts
git commit -m "feat(conversation): archive write-behind + LTRIM atômico via Lua (anti-perda)"
```

---

## Task 5: Enganchar no keyspace listener (com coalescing)

**Files:** Modify `apps/api/src/realtime/keyspace.listener.ts` (+ spec) e o módulo que o provê.

**Correção do review (Baixo 2):** a cada `rpush` dispararia um `lrange`+insert; em escala satura o pool (256MB, 10 conns). Coalescer por conversa: só arquiva se não houve archive nos últimos `CHATHISTORY_ARCHIVE_THROTTLE_SEC` (guarda via `SET archive:throttle:{inst}:{jid} NX EX <sec>`). O trim é seguro mesmo throttled (a Lua sempre arquiva o que remove).

- [ ] **Step 1: Teste** — em `message.received`, `archiveTail` é chamado; segunda chamada dentro da janela é coalescida (não chama). Estender `keyspace.listener.spec.ts`.
- [ ] **Step 2: Rodar (deve falhar)** → FAIL.
- [ ] **Step 3: Implementar** — injetar `MessageArchiveService`; no ramo `message.received`, `this.archive.archiveTail(...).catch(...)` **sem await bloqueante** (best-effort, não atrasa o publish do realtime). O `archiveTail` retorna cedo se `CHATHISTORY_ARCHIVE_ENABLED=false` (gate de rollout). **O gate de coalescing (`SET NX EX`) envolve o método `archiveTail` INTEIRO** (passos 1 e 2), não só o archive da cauda — se throttled, nem archive nem trim rodam naquele ciclo (seguro: nada é aparado sem archive).
- [ ] **Step 4: Rodar (deve passar)** → PASS.
- [ ] **Step 5: Commit**

```
git add apps/api/src/realtime/ apps/api/src/conversation/
git commit -m "feat(realtime): dispara archive do chathistory (write-behind, coalescido)"
```

---

## Task 6: Leitura tiered em `ConversationRepository`

**Files:** Modify `conversation.repository.ts` (+ spec).

- [ ] **Step 1: Testes** — `getMessages` inalterado (cauda do Redis). Novo `getMessagesPage(instancia, jid, { beforeMsgId, limit })`: resolve `beforeSeq = seqOf(beforeMsgId)` e delega ao `MessageArchiveRepository.readPage`, mapeando para o mesmo shape `Message` (reusar `parseHistoryEntry`/mapeamento).
- [ ] **Step 2: Rodar (deve falhar)** → FAIL.
- [ ] **Step 3: Implementar** — injetar `MessageArchiveRepository`; paginação por `seq` (não `ts`, que é nullable). Mapear `MessageRow` → `Message` de forma consistente com `getMessages`.
- [ ] **Step 4: Rodar (deve passar)** → PASS.
- [ ] **Step 5: Commit**

```
git add apps/api/src/conversation/conversation.repository.ts apps/api/src/conversation/conversation.repository.spec.ts
git commit -m "feat(conversation): leitura tiered (cauda Redis + histórico frio Postgres por seq)"
```

> **Escopo (endpoint HTTP):** expor `getMessagesPage` no controller (scroll-para-cima) fica para a Etapa 5/UI (YAGNI). Os testes desta task exercitam o método diretamente; código preparatório, registrado como intencional.

---

## Task 7: Backfill único do histórico existente

**Files:** Create `chathistory-backfill.command.ts` (+ spec).

- [ ] **Step 1: Teste** — `SCAN chathistory:*` (cursor, não `KEYS`), parse `{inst}-{id}` (ver `conversation-index.service.ts:47-49`), `lrange 0 -1`, `insertManyIdempotent` da lista inteira; rodar 2x não duplica (chave `legacy-sha1` estável).
- [ ] **Step 2: Rodar (deve falhar)** → FAIL.
- [ ] **Step 3: Implementar** — comando standalone (script npm) OU `onApplicationBootstrap` guardado por `BACKFILL_CHATHISTORY=once`. **NÃO** faz LTRIM (só arquiva).
- [ ] **Step 4: Rodar (deve passar)** → PASS.
- [ ] **Step 5: Commit**

```
git add apps/api/src/conversation/chathistory-backfill.command.ts apps/api/src/conversation/chathistory-backfill.command.spec.ts
git commit -m "feat(conversation): backfill único do chathistory para o Postgres"
```

---

## Task 8: Suite verde + typecheck

- [ ] **Step 1:** `npm test --prefix apps/api` → PASS (toda a suite, incl. pré-existentes).
- [ ] **Step 2:** `npm run lint --prefix apps/api` → PASS.
- [ ] **Step 3:** Commit de ajustes se houver.

---

## Rollout (runbook — passos do Rafa, fora da pipeline)

> **Ordem crítica:** backfill ANTES do archive incremental, senão o `seq` fica fora de ordem cronológica (ver "Ordem do seq" no topo). Ambas as flags começam OFF.

1. Deploy com `CHATHISTORY_ARCHIVE_ENABLED=false` e `CHATHISTORY_LTRIM_ENABLED=false` (nada arquiva nem apara ainda).
2. Rodar o **backfill** uma vez (Task 7): setar `BACKFILL_CHATHISTORY=once` e subir → histórico existente entra no Postgres **em ordem de lista** (`seq` cronológico). **Ao terminar, REMOVER `BACKFILL_CHATHISTORY` do env** antes do próximo deploy (o gate roda de novo a cada boot com a flag setada; é idempotente via ON CONFLICT, mas desperdiça SCAN+lrange). O backfill cede o event loop a cada 500 conversas p/ não estourar o healthcheck; em bases muito grandes, considere rodá-lo como job dedicado em vez de no boot da API.
3. **Validar por amostragem de WAMIDs** (não por `llen`, que diverge por dedup de eco e entradas malformadas): pegar N mensagens conhecidas de algumas conversas e confirmar presença/ordem em `messages`. Conferir que a leitura tiered devolve páginas antigas corretas e ordenadas.
4. Ligar `CHATHISTORY_ARCHIVE_ENABLED=true` → daqui pra frente só mensagens genuinamente novas são anexadas (mantêm o `seq` cronológico).
5. Ligar `CHATHISTORY_LTRIM_ENABLED=true` → Redis mantém só a cauda (`CHATHISTORY_HOT_CAP`).
6. Observar a memória do Redis cair; validar que UI e N8N seguem lendo a cauda normalmente.

**Rollback:** desligar `CHATHISTORY_LTRIM_ENABLED` (para de aparar). O que já foi aparado permanece no Postgres (leitura tiered cobre). Sem perda.
```
