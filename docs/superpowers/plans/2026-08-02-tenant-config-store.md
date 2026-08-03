# Config store por tenant — cabeia o seam GO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Fatia 2.3 da Etapa 2. Entregar o **config store por tenant** (`tenant_engine_config` no Postgres + write-through Redis `tenant:cfg:*` + reconcile no boot) e **cabear o seam GO** que a Fatia 2.2 deixou pronto (`GatewayConfigStore`): `resolveInstanceId(UUID)→instancia` e `ownerJid(instancia)`. Com isso, eventos da Evolution GO passam a **resolver** no normalizer (deixam de dar `normalizer-drop` por instância desconhecida). Adiciona `gateway`/`transport` ao registry (D7) para a Fatia 2.4 selecionar o adapter de saída.

**Architecture:** Postgres é a **fonte de verdade** (`tenant_engine_config(instancia, config jsonb, cfg_version, updated_at)`; §4.6). O **painel** precisa resolver config DENTRO do normalizer, que é uma função **pura e SÍNCRONA** — logo a resolução por evento vem de um **snapshot em memória** (`InMemoryGatewayConfigStore`, implementa o seam sync), hidratado no boot a partir do Postgres e re-hidratado periodicamente (config muda raramente; espelha o reconciler existente da conexão). O **write-through Redis** (`tenant:cfg:<instancia>`) é mantido no upsert + boot para o **futuro engine GO** (Etapa 4) e observabilidade — o painel NÃO lê Redis para isso (evita drift). `gateway`/`transport` moram **só no registry** (`tenants`), uma fonte de verdade (§4.6/D7).

**Tech Stack:** NestJS, Drizzle ORM (Postgres), ioredis, Vitest. Reusa `GatewayConfigStore`/`GATEWAY_CONFIG_STORE` (seam da 2.2) e `RedisKeys` de `@nexus/shared`.

**Invariantes (não quebrar):**
- **Seam é SÍNCRONO:** `GatewayConfigStore.resolveInstanceId`/`ownerJid` retornam valor imediato (não `Promise`). O normalizer (`packages/shared`, puro) chama isso dentro de si — **NUNCA** transformar em async (quebraria o contrato v1 + os testes dourados da 2.1). A resolução é sempre sobre o snapshot em memória.
- **Chave canônica = nome do painel/registry** (`Shkgroup`, casing atual). A GO entra como ATRIBUTO (`instanceId` no jsonb), **nunca** como chave (§4.6).
- **`gateway` mora SÓ no registry** (`tenants.gateway`). O espelho Redis da config replica o valor derivado do registry, nunca o contrário — **sem dupla escrita** (§4.6).
- **Fronteira de dados:** o Postgres é a fonte de verdade; o caminho quente de mensagem NÃO passa síncrono pelo Postgres (o store em memória serve o normalizer; o Postgres só é lido no boot + reconcile periódico).
- **Migration:** `drizzle-kit generate` + **conferir `_journal.json`** (`when` estritamente crescente, entrada registrada) antes de commitar — gotcha conhecido ([[project_drizzle_journal_gotcha]]): migration com `when` fora de ordem é PULADA e derruba prod. `migrate()` roda no boot (`main.ts:47`).
- **NÃO é o finding #3 da auditoria:** esta fatia faz o GO RESOLVER (instância + ownerJid). A impedância de SHAPE (v1-GO ↔ `processEvolutionEvent`: contacts em array, `data.instance.state`) continua **gate de Fase 0** — as fixtures GO são `@provisional` e consertar contra payload não capturado é proibido. Não tocar `processEvolutionEvent` aqui.
- **Kill-switch preservado:** a config e o reconcile rodam SEMPRE (independente de `QUEUE_CONSUMER_ENABLED`), mas o consumer continua gated. Cabear o store não liga o consumo.

**Nota de commit:** `apps/**` e `docs/**` fora do `.gitignore` no working tree — usar `git add -f docs/...` para o cronograma. Identidade `rafabrh`, sem trailers do Claude. Branch `feat/tenant-config-store` off `worktree-macos-reskin` (após #22 mergeado; se ainda não, off `feat/queue-consumer`). Após mudar `packages/shared`, `pnpm --filter @nexus/shared build` antes do typecheck do apps/api.

---

## File Structure

- **Modify** `apps/api/src/core/db/schema.ts` — nova `tenantEngineConfig`; colunas `gateway`/`transport` em `tenants`.
- **Generate** `apps/api/drizzle/0005_*.sql` (+ entrada em `apps/api/drizzle/meta/_journal.json`) — via `drizzle-kit generate`.
- **Modify** `packages/shared/src/constants/redis-keys.ts` (+spec) — `RedisKeys.tenantCfg(inst)`.
- **Move** o contrato do seam para um lar neutro: **Create** `apps/api/src/tenant-config/gateway-config-store.ts` (interface `GatewayConfigStore` + token `GATEWAY_CONFIG_STORE` + `EmptyGatewayConfigStore`), **Modify** `apps/api/src/queue/normalize-context.provider.ts` para importar de lá. Remove a dependência invertida (queue → tenant-config vira a única direção).
- **Create** `apps/api/src/tenant-config/tenant-engine-config.types.ts` — `TenantEngineConfig` (jsonb).
- **Create** `apps/api/src/tenant-config/tenant-engine-config.repository.ts` (+spec) — CRUD Drizzle + `list()`.
- **Create** `apps/api/src/tenant-config/in-memory-gateway-config.store.ts` (+spec) — impl SÍNCRONA do seam (dois `Map`s) + `hydrate()`.
- **Create** `apps/api/src/tenant-config/tenant-config.service.ts` (+spec) — upsert (Postgres + write-through Redis + hidrata store), `reconcile()` (boot + periódico).
- **Create** `apps/api/src/tenant-config/tenant-config.module.ts` — provê repo/service/store; roda reconcile no boot; **exporta** o store + token.
- **Modify** `apps/api/src/queue/queue.module.ts` — importa `TenantConfigModule`; no branch habilitado, `{ provide: GATEWAY_CONFIG_STORE, useExisting: InMemoryGatewayConfigStore }`.
- **Modify** `apps/api/src/app.module.ts` — importa `TenantConfigModule` (sempre-on: reconcile roda mesmo com consumer off).
- **Modify** `apps/api/src/core/config/app.config.ts` — `TENANT_CFG_RECONCILE_SEC` (default 60).
- **Create** `apps/api/src/tenant-config/seed/2.3-go-tenant.sql` — template de seed de tenant GO (piloto; §4.6 "seed via SQL").

---

## Task 1: Schema + migration (tenant_engine_config + registry gateway/transport)

**Files:** Modify `apps/api/src/core/db/schema.ts`; Generate `apps/api/drizzle/0005_*.sql` + `_journal.json`.

- [ ] **Step 1:** Em `schema.ts`, adicionar as colunas ao `tenants` (registry — fonte única do gateway):

```ts
export const tenants = pgTable('tenants', {
  // ...campos existentes...
  n8nWebhookUrl: text('n8n_webhook_url'),
  gateway: text('gateway').notNull().default('node'),      // node | go  (D7)
  transport: text('transport').notNull().default('webhook'), // webhook | amqp (D7)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2:** Adicionar a tabela `tenantEngineConfig` (config jsonb + cfg_version; §4.6):

```ts
export const tenantEngineConfig = pgTable('tenant_engine_config', {
  instancia: text('instancia')
    .primaryKey()
    .references(() => tenants.instancia, { onDelete: 'cascade' }),
  // jsonb aberto: conteúdo rico (persona/templates/llm*) fecha na Fase 0/Etapa 4.
  // v1 usa só ownerJid + instanceId (campos exigidos pela GO — §4.6).
  config: jsonb('config').$type<TenantEngineConfig>().notNull().default({}),
  cfgVersion: integer('cfg_version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type TenantEngineConfigRow = typeof tenantEngineConfig.$inferSelect;
```

  Importar `TenantEngineConfig` de `../../tenant-config/tenant-engine-config.types` (criado no Task 3; para o Step de generate, pode-se tipar como `Record<string, unknown>` provisoriamente e apertar depois — mas prefira criar o types primeiro, é 1 arquivo).

- [ ] **Step 3: Gerar a migration.** Run: `pnpm --filter @nexus/api exec drizzle-kit generate` → cria `apps/api/drizzle/0005_*.sql`.
- [ ] **Step 4: CONFERIR O JOURNAL (gotcha [[project_drizzle_journal_gotcha]]).** Abrir `apps/api/drizzle/meta/_journal.json` e confirmar: nova entrada `idx: 5`, `tag` = `0005_*`, e **`when` > 1785642369932** (o maior atual). Se o `when` vier menor/fora de ordem, a migration é pulada silenciosamente no boot → 500 em prod. Abrir o `.sql` e confirmar: `ALTER TABLE "tenants" ADD COLUMN "gateway"...`, `..."transport"...`, `CREATE TABLE "tenant_engine_config"...`.
- [ ] **Step 5: Aplicar localmente e provar o boot.** Run: `pnpm --filter @nexus/api build` (typecheck) → PASS. Se houver Postgres local, subir a API e confirmar `Database migrations applied`. Sem Postgres local, o gate é o typecheck + a conferência do journal.
- [ ] **Step 6: Commit** — `feat(db): tenant_engine_config + registry gateway/transport (migration 0005, §4.6/D7)`.

---

## Task 2: `RedisKeys.tenantCfg` (chave do write-through)

**Files:** Modify `packages/shared/src/constants/redis-keys.ts` + `redis-keys.spec.ts`. TDD.

- [ ] **Step 1: Teste que falha** — em `redis-keys.spec.ts`:

```ts
it('tenantCfg namespaceia a config por instância', () => {
  expect(RedisKeys.tenantCfg('Shkgroup')).toBe('tenant:cfg:Shkgroup');
});
```

- [ ] **Step 2: Rodar (falha).** Run: `pnpm --filter @nexus/shared test`.
- [ ] **Step 3: Implementar** — adicionar ao objeto `RedisKeys` (§4.6/§204):

```ts
// Espelho da config por tenant (write-through do Postgres). Lido pelo futuro
// engine GO (Etapa 4); o painel hidrata o store em memória a partir do Postgres.
tenantCfg: (inst: string) => `tenant:cfg:${inst}`,
```

- [ ] **Step 4: Rodar (passa)** + `pnpm --filter @nexus/shared build` (regenera dist p/ o apps/api enxergar). — [ ] **Step 5: Commit** — `feat(shared): RedisKeys.tenantCfg (write-through da config por tenant)`.

---

## Task 3: `TenantEngineConfig` type + `gateway-config-store.ts` (mover o contrato do seam)

**Files:** Create `apps/api/src/tenant-config/tenant-engine-config.types.ts`, `apps/api/src/tenant-config/gateway-config-store.ts`; Modify `apps/api/src/queue/normalize-context.provider.ts` (+ atualizar o import no `normalize-context.provider.spec.ts`).

- [ ] **Step 1:** Criar o type do jsonb (só o v1 usado agora; resto na Fase 0):

```ts
// tenant-engine-config.types.ts
export interface TenantEngineConfig {
  /** UUID da instância GO (whatsmeow) → usado no reverse map instanceId→instancia. */
  instanceId?: string;
  /** JID do dono (gate self-chat / injetado no `sender` do GO pelo normalizer). */
  ownerJid?: string;
  // Fase 0/Etapa 4: persona, templates /tpl, flags de módulo, llmProvider/llmModel...
}
```

- [ ] **Step 2:** Mover a interface/token/stub do seam de `queue/normalize-context.provider.ts` para `tenant-config/gateway-config-store.ts` (owner natural = config), **conteúdo idêntico** ao da 2.2:

```ts
// gateway-config-store.ts
export interface GatewayConfigStore {
  resolveInstanceId(instanceId: string): string | null;
  ownerJid(instancia: string): string | undefined;
}
export const GATEWAY_CONFIG_STORE = 'GATEWAY_CONFIG_STORE';
export class EmptyGatewayConfigStore implements GatewayConfigStore {
  resolveInstanceId(): string | null { return null; }
  ownerJid(): string | undefined { return undefined; }
}
```

- [ ] **Step 3:** Em `normalize-context.provider.ts`, remover essas 3 definições e passar a **importar** de `../tenant-config/gateway-config-store`. Reexportar para não quebrar imports existentes: `export { GATEWAY_CONFIG_STORE, type GatewayConfigStore } from '../tenant-config/gateway-config-store';`. Atualizar o import em `normalize-context.provider.spec.ts` (`GatewayConfigStore` continua vindo de `./normalize-context.provider` via reexport — nada muda no teste).
- [ ] **Step 4:** `pnpm --filter @nexus/api exec vitest run src/queue` → PASS (sem regressão; direção agora é queue → tenant-config).
- [ ] **Step 5: Commit** — `refactor(tenant-config): contrato GatewayConfigStore em tenant-config/ (owner natural) + TenantEngineConfig`.

---

## Task 4: `TenantEngineConfigRepository` (Drizzle CRUD + list)

**Files:** Create `apps/api/src/tenant-config/tenant-engine-config.repository.ts` (+spec). TDD (mock `Database`, no estilo de `tenant.repository.spec.ts`).

- [ ] **Step 1: Testes** — `get(instancia)` devolve `{ instancia, config, cfgVersion }` ou `null`; `list()` devolve todas as linhas; `upsert(instancia, config)` faz insert `onConflictDoUpdate` (merge do jsonb + `cfg_version = cfg_version + 1` + `updated_at = now()`). Mock do `db` com `select/from/where` e `insert/values/onConflictDoUpdate` retornando spies.
- [ ] **Step 2: Rodar (falha).**
- [ ] **Step 3: Implementar** — injeta `@Inject(DB) db: Database`. `upsert` bumpa `cfgVersion` (detecção de drift, §4.6). `list()` é a fonte da hidratação do store.

```ts
async upsert(instancia: string, config: TenantEngineConfig): Promise<void> {
  await this.db.insert(tenantEngineConfig)
    .values({ instancia, config, cfgVersion: 1 })
    .onConflictDoUpdate({
      target: tenantEngineConfig.instancia,
      set: { config, cfgVersion: sql`${tenantEngineConfig.cfgVersion} + 1`, updatedAt: new Date() },
    });
}
async list(): Promise<TenantEngineConfigRow[]> {
  return this.db.select().from(tenantEngineConfig);
}
```

- [ ] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(tenant-config): TenantEngineConfigRepository (CRUD + list, cfg_version bump)`.

---

## Task 5: `InMemoryGatewayConfigStore` (impl SÍNCRONA do seam)

**Files:** Create `apps/api/src/tenant-config/in-memory-gateway-config.store.ts` (+spec). TDD.

O coração da fatia: resolução SÍNCRONA sobre dois `Map`s, hidratados a partir da lista de configs.

- [ ] **Step 1: Testes**
  - `hydrate([{instancia:'Shk', config:{instanceId:'uuid-1', ownerJid:'55@s.whatsapp.net'}}])` → `resolveInstanceId('uuid-1')==='Shk'`; `ownerJid('Shk')==='55@s.whatsapp.net'`; desconhecidos → `null`/`undefined`.
  - `hydrate` **substitui** o snapshot inteiro (remoções somem): re-hidratar com lista vazia → resolve `null`.
  - config sem `instanceId`/`ownerJid` → não entra nos maps (sem lixo).
- [ ] **Step 2: Rodar (falha).**
- [ ] **Step 3: Implementar:**

```ts
@Injectable()
export class InMemoryGatewayConfigStore implements GatewayConfigStore {
  private byInstanceId = new Map<string, string>(); // UUID GO → instancia
  private ownerByInstancia = new Map<string, string>(); // instancia → ownerJid

  /** Substitui o snapshot inteiro (idempotente; remoções refletem). */
  hydrate(rows: { instancia: string; config: TenantEngineConfig }[]): void {
    const byId = new Map<string, string>();
    const owner = new Map<string, string>();
    for (const { instancia, config } of rows) {
      if (config.instanceId) byId.set(config.instanceId, instancia);
      if (config.ownerJid) owner.set(instancia, config.ownerJid);
    }
    this.byInstanceId = byId;
    this.ownerByInstancia = owner;
  }
  resolveInstanceId(instanceId: string): string | null {
    return this.byInstanceId.get(instanceId) ?? null;
  }
  ownerJid(instancia: string): string | undefined {
    return this.ownerByInstancia.get(instancia);
  }
}
```

- [ ] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(tenant-config): InMemoryGatewayConfigStore (seam sync, snapshot em memória)`.

---

## Task 6: `TenantConfigService` (write-through + reconcile boot/periódico)

**Files:** Create `apps/api/src/tenant-config/tenant-config.service.ts` (+spec); Modify `apps/api/src/core/config/app.config.ts` (`TENANT_CFG_RECONCILE_SEC`). TDD.

- [ ] **Step 1:** Adicionar ao `AppConfig` (estilo dos flags existentes):

```ts
// Intervalo do reconcile periódico do store de config (segundos). Config muda
// raramente; mantém o snapshot em memória fresco entre réplicas sem pub/sub.
@IsOptional() @Type(() => Number) @IsNumber() @Min(5)
TENANT_CFG_RECONCILE_SEC: number = 60;
```

- [ ] **Step 2: Testes**
  - `upsert(inst, cfg)` → chama `repo.upsert`, escreve `redis.set(RedisKeys.tenantCfg(inst), JSON)` (write-through) e re-hidrata o store (chama `store.hydrate` com a lista atualizada). Mocks: repo, redis, store.
  - `reconcile()` → lê `repo.list()`, escreve todas no Redis (write-through) e chama `store.hydrate(rows)`.
  - `onApplicationBootstrap` → chama `reconcile()` uma vez e **agenda** o intervalo (`setInterval` com `TENANT_CFG_RECONCILE_SEC`); `onModuleDestroy` → `clearInterval`. Best-effort: falha do reconcile periódico é logada, nunca derruba o boot.
- [ ] **Step 3: Rodar (falha).**
- [ ] **Step 4: Implementar** — `implements OnApplicationBootstrap, OnModuleDestroy`. O reconcile periódico re-hidrata o store (Postgres→memória); o write-through do Redis acontece no `upsert` + no reconcile de boot (não a cada tick — evita reescrever o Redis inteiro em loop). Injeta repo, `@Inject(REDIS_CLIENT)`, store, config, Logger.

```ts
async reconcile(): Promise<void> {
  const rows = await this.repo.list();
  await Promise.all(rows.map((r) =>
    this.redis.set(RedisKeys.tenantCfg(r.instancia), JSON.stringify(r.config))));
  this.store.hydrate(rows);
  this.logger.log(`tenant-cfg.reconciled n=${rows.length}`);
}
async rehydrate(): Promise<void> { // tick periódico: só memória, sem reescrever Redis
  this.store.hydrate(await this.repo.list());
}
```

- [ ] **Step 5: Rodar (passa).** — [ ] **Step 6: Commit** — `feat(tenant-config): TenantConfigService (write-through Redis + reconcile boot/periódico)`.

---

## Task 7: `TenantConfigModule` + wiring (cabeia o seam GO)

**Files:** Create `apps/api/src/tenant-config/tenant-config.module.ts`; Modify `apps/api/src/app.module.ts`, `apps/api/src/queue/queue.module.ts`.

- [ ] **Step 1:** `TenantConfigModule` provê `TenantEngineConfigRepository`, `InMemoryGatewayConfigStore`, `TenantConfigService`; **exporta** `InMemoryGatewayConfigStore` e `TenantConfigService`. (DB e REDIS_CLIENT são globais — disponíveis.)
- [ ] **Step 2:** `AppModule` importa `TenantConfigModule` **sempre** (o reconcile/boot roda mesmo com o consumer off — a config precisa estar quente e o Redis espelhado para o engine).
- [ ] **Step 3:** No `QueueModule.register()` (branch **habilitado**): importar `TenantConfigModule` e bindar o token do seam ao store real:

```ts
providers: [
  EventDedupService, NormalizeContextProvider, EvolutionQueueConsumer,
  { provide: GATEWAY_CONFIG_STORE, useExisting: InMemoryGatewayConfigStore },
],
imports: [WebhookModule, TenantConfigModule, RabbitMQModule.forRootAsync({ /* ... */ })],
```

  Agora `NormalizeContextProvider` recebe o store real via `@Inject(GATEWAY_CONFIG_STORE)` → o branch GO de `contextFor` resolve `instanceId→instancia` e `ownerJid`.
- [ ] **Step 4: Teste de fiação** — estender `queue.module.spec.ts`: com o consumer habilitado, `mod.imports` inclui `TenantConfigModule` e `mod.providers` contém o binding `GATEWAY_CONFIG_STORE`. Com o consumer OFF, `TenantConfigModule` **não** entra pelo QueueModule (mas entra pelo AppModule — o boot da config independe do kill-switch).
- [ ] **Step 5:** `pnpm --filter @nexus/api lint` PASS. Commit — `feat(tenant-config): TenantConfigModule + wiring do seam GO no QueueModule`.

---

## Task 8: Seed SQL (piloto) + suíte verde + review + PR

**Files:** Create `apps/api/src/tenant-config/seed/2.3-go-tenant.sql`; Modify o cronograma.

- [ ] **Step 1:** Template de seed do piloto (§4.6 "seed via SQL; UI fora de escopo"). Documenta o flip do registry + a config GO — valores reais (UUID/ownerJid) capturados na Fase 0:

```sql
-- Seed de um tenant GO (piloto). Rodar manualmente após capturar instanceId/ownerJid
-- na Fase 0. A chave canônica (:instancia) é o NOME do painel/registry.
INSERT INTO tenant_engine_config (instancia, config, cfg_version)
VALUES (:instancia, jsonb_build_object('instanceId', :go_uuid, 'ownerJid', :owner_jid), 1)
ON CONFLICT (instancia) DO UPDATE
  SET config = EXCLUDED.config, cfg_version = tenant_engine_config.cfg_version + 1, updated_at = now();
-- Flip do gateway/transport (registry = fonte única). SÓ no cutover (§7.1), com aval.
-- UPDATE tenants SET gateway='go', transport='amqp' WHERE instancia = :instancia;
```

- [ ] **Step 2:** `pnpm --filter @nexus/api test` → PASS (incl. pré-existentes; sem regressão). `pnpm --filter @nexus/shared test` → PASS.
- [ ] **Step 3:** `pnpm --filter @nexus/api lint` → PASS.
- [ ] **Step 4: Review** (spec compliance §4.6/D7 + qualidade) da fatia; corrigir; commit de ajustes.
- [ ] **Step 5:** Atualizar o CRONOGRAMA VIVO (`2026-08-01-...roadmap.md`): Fatia 2.3 → 🔵; anotar que o seam GO está cabeado e que o finding #3 (shape) + a ativação seguem gate de Fase 0. Abrir PR contra `worktree-macos-reskin`. Commit `docs(plans): fecha Fatia 2.3 no cronograma`.

---

## Portões manuais (🔒) desta fatia
- **Seed real do tenant GO** (`instanceId`/`ownerJid`) e **flip `gateway='go'`/`transport='amqp'`** via SQL — só na Fase 0/cutover (§7.1), com aval do Rafa. Esta fatia entrega o mecanismo; os valores reais dependem da captura na GO.
- **Finding #3 (impedância de shape v1-GO ↔ `processEvolutionEvent`)** permanece gate de Fase 0 — resolver contra payload GO **capturado** (fixtures saindo de `@provisional`), não aqui.
- **Ativação do consumer** (`QUEUE_CONSUMER_ENABLED=true` + `RABBITMQ_URL`) segue portão da Fatia 2.2 (broker no ar + gates de robustez #2/#4).

## Depende de / destrava
- **Depende de:** Fatia 2.2 (seam `GatewayConfigStore` + `NormalizeContextProvider`) — mergeada no PR #22.
- **Destrava:** Fatia 2.4 (`EvolutionClient` port seleciona adapter por `tenants.gateway`) e o engine GO-native (lê `tenant:cfg:*` do Redis).
