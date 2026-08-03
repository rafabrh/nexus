# `EvolutionClient` port + 2 adapters (node|go) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Fatia 2.4 (fecha a Etapa 2). Transformar o `EvolutionClient` num **port de saída** com dois adapters (`node` = client atual; `go` = dialeto REST GO), **selecionado por `tenants.gateway`** — o envio de mensagem/mídia/QR do painel funciona nos dois mundos durante a transição, **sem reescrever nenhum consumidor** (§4.3).

**Architecture:** O `EvolutionClient` **mantém seu nome e token de DI** e vira um **router**: para cada chamada resolve o gateway do tenant (por `instancia`, o 1º argumento de todo método) e **delega** ao `EvolutionNodeAdapter` (impl atual, fetch + `evolutionPolicy`) ou ao `EvolutionGoAdapter`. A resolução é **SÍNCRONA** — de um snapshot em memória `instancia→gateway` (default `node`) hidratado no boot pelo reconcile já existente da Fatia 2.3 (uma query, um snapshot). O `EvolutionGoAdapter` é um **esqueleto @provisional** que lança `NotImplemented` até a captura do dialeto REST GO na Fase 0 — como ninguém está em `gateway='go'`, o router sempre escolhe `node` e o comportamento de prod **não muda**.

**Tech Stack:** NestJS, `fetch` + cockatiel (`evolutionPolicy`), Drizzle, Vitest. Reusa o config store / reconcile da Fatia 2.3 (`InMemoryGatewayConfigStore`, `TenantConfigService`) e `tenants.gateway` (migration 0005).

**Invariantes (não quebrar):**
- **Consumidores inalterados:** `conversation.service`, `onboarding.service`, `sync.service`, `connection-reconciler.service`, `whatsapp.service` continuam injetando o token `EvolutionClient` e chamando os MESMOS métodos. O router preserva a assinatura pública inteira (o port = superfície atual do `EvolutionClient`).
- **Comportamento Node idêntico:** o `EvolutionNodeAdapter` é o código atual movido 1:1 (fetch, headers `apikey`, `evolutionPolicy`, timeouts, `probeState` tri-estado). Nenhuma mudança de fio.
- **Resolução SÍNCRONA:** `gatewayFor(instancia)` lê de um `Map` em memória (default `node` para desconhecido) — **nunca** I/O async por envio. Hidratado no boot + tick periódico (reconcile da 2.3).
- **`gateway` mora SÓ no registry** (`tenants.gateway`, D7). O snapshot só REPLICA (leitura); ninguém escreve gateway por aqui. Flip via SQL no cutover (§7.1, 🔒).
- **GO é @provisional/gated:** o `EvolutionGoAdapter` lança `NotImplemented` com ponteiro p/ Fase 0. NÃO chutar endpoints/payloads GO (o dialeto REST se captura com o número de teste na Fase 0 — mesma disciplina das fixtures `@provisional`). Nenhum tenant em `gateway='go'` até lá.
- **Webhook N8N sagrado:** nada aqui toca `setWebhook`/config da Evolution.

**Nota de commit:** `apps/**`/`docs/**` fora do `.gitignore` no working tree (usar `git add -f docs/...`). Identidade `rafabrh`, sem trailers do Claude. Branch `feat/evolution-client-port` off `worktree-macos-reskin`.

---

## File Structure

- **Create** `apps/api/src/whatsapp/evolution-gateway.port.ts` — interface `EvolutionGateway` (a superfície pública atual) + `EVOLUTION_GATEWAY_NODE`/`EVOLUTION_GATEWAY_GO` tokens.
- **Create** `apps/api/src/whatsapp/evolution-node.adapter.ts` (+ mover o spec atual) — o conteúdo do `evolution.client.ts` de hoje, renomeado p/ `EvolutionNodeAdapter implements EvolutionGateway`.
- **Create** `apps/api/src/whatsapp/evolution-go.adapter.ts` (+spec) — `EvolutionGoAdapter implements EvolutionGateway`, métodos lançam `NotImplemented` (@provisional, Fase 0).
- **Rewrite** `apps/api/src/whatsapp/evolution.client.ts` (+spec) — `EvolutionClient` vira o router (mesmo token) que delega por `gatewayFor(instancia)`.
- **Modify** `apps/api/src/tenant-config/tenant-engine-config.repository.ts` — `listWithGateway()` (LEFT JOIN `tenants` ⋈ `tenant_engine_config`).
- **Modify** `apps/api/src/tenant-config/in-memory-gateway-config.store.ts` (+spec) — mapa `instancia→gateway` + `gatewayFor()`; `hydrate` passa a receber `gateway`.
- **Modify** `apps/api/src/tenant-config/tenant-config.service.ts` (+spec) — reconcile/rehydrate usam `listWithGateway()`.
- **Modify** `apps/api/src/whatsapp/whatsapp.module.ts` — provê adapters + router; importa `TenantConfigModule`; mantém `exports: [EvolutionClient]`.

---

## Task 1: Port `EvolutionGateway` (extrai a superfície atual)

**Files:** Create `apps/api/src/whatsapp/evolution-gateway.port.ts`.

- [ ] **Step 1:** Declarar a interface com **exatamente** os métodos públicos do `evolution.client.ts` atual (assinaturas idênticas): `sendTextMessage`, `sendMedia`, `sendWhatsAppAudio`, `sendContact`, `sendLocation`, `healthCheck`, `fetchInstances`, `getConnectionState`, `probeState`, `findContacts`, `fetchProfilePictureUrl`, `findMessages`, `getBase64FromMediaMessage`, `findChats`, `createInstance`, `getQrCode`, `deleteInstance`. Copiar os tipos de retorno/params exatos (ex.: `probeState(): Promise<{status:'exists';state:string}|{status:'absent'}|{status:'unknown'}>`).
- [ ] **Step 2:** Exportar tokens de DI: `export const EVOLUTION_GATEWAY_NODE = 'EVOLUTION_GATEWAY_NODE'; export const EVOLUTION_GATEWAY_GO = 'EVOLUTION_GATEWAY_GO';`.
- [ ] **Step 3:** `pnpm --filter @nexus/api lint` → PASS (interface pura, sem impl). — [ ] **Step 4: Commit** — `feat(whatsapp): port EvolutionGateway (superfície de saída extraída, §4.3)`.

---

## Task 2: `EvolutionNodeAdapter` (client atual → adapter do port)

**Files:** Create `apps/api/src/whatsapp/evolution-node.adapter.ts`; mover `evolution.client.spec.ts` → `evolution-node.adapter.spec.ts`.

- [ ] **Step 1:** Copiar o conteúdo INTEGRAL do `evolution.client.ts` atual para o novo arquivo; renomear a classe `EvolutionClient` → `EvolutionNodeAdapter`; adicionar `implements EvolutionGateway`. **Nada de lógica muda** (fetch, `apikey`, `evolutionPolicy`, timeouts).
- [ ] **Step 2:** Mover o spec atual, trocando o import/subject `EvolutionClient` → `EvolutionNodeAdapter`. Os mesmos testes de comportamento devem passar SEM alteração de asserção.
- [ ] **Step 3: Rodar** `pnpm --filter @nexus/api test src/whatsapp/evolution-node.adapter.spec.ts` → PASS (comportamento idêntico).
- [ ] **Step 4:** O `implements` prova a conformidade com o port em compile-time. — [ ] **Step 5: Commit** — `refactor(whatsapp): EvolutionNodeAdapter (client atual implementa o port, sem mudança de comportamento)`.

---

## Task 3: `listWithGateway()` + snapshot de gateway (estende a 2.3)

**Files:** Modify `tenant-engine-config.repository.ts` (+spec), `in-memory-gateway-config.store.ts` (+spec).

- [ ] **Step 1 (repo, TDD):** `listWithGateway(): Promise<{instancia:string; gateway:string; config:TenantEngineConfig}[]>` — LEFT JOIN `tenants` ⋈ `tenant_engine_config` (inclui tenants SEM config: `gateway` presente, `config` = `{}`). Teste com mock db.

```ts
async listWithGateway() {
  return this.db
    .select({ instancia: tenants.instancia, gateway: tenants.gateway, config: tenantEngineConfig.config })
    .from(tenants)
    .leftJoin(tenantEngineConfig, eq(tenants.instancia, tenantEngineConfig.instancia));
}
```

- [ ] **Step 2 (store, TDD):** estender `InMemoryGatewayConfigStore`:
  - `hydrate(rows: {instancia; gateway?; config}[])` também popula `gatewayByInstancia` (default `'node'` quando gateway ausente/inválido; só aceita `'node'|'go'`).
  - `gatewayFor(instancia): 'node' | 'go'` → default `'node'` para desconhecido.
  - Testes: `hydrate([{instancia:'Shk', gateway:'go', config:{}}])` → `gatewayFor('Shk')==='go'`; desconhecido → `'node'`; gateway inválido → `'node'`.
- [ ] **Step 3: Rodar** os dois specs → PASS.
- [ ] **Step 4: Commit** — `feat(tenant-config): snapshot instancia→gateway (listWithGateway + gatewayFor, default node)`.

---

## Task 4: reconcile hidrata o gateway (uma query, um snapshot)

**Files:** Modify `tenant-config.service.ts` (+spec).

- [ ] **Step 1: Testes** — `reconcile`/`rehydrate` chamam `repo.listWithGateway()` (não mais `list()`) e passam as linhas (com `gateway`) ao `store.hydrate`. O write-through Redis segue por `instancia` (inalterado). Ajustar os mocks do spec (`listWithGateway` no lugar de `list`).
- [ ] **Step 2: Rodar (falha).** — [ ] **Step 3: Implementar** — trocar `this.repo.list()` por `this.repo.listWithGateway()` em `reconcile` e `rehydrate`; o `hydrate` já aceita `gateway` (Task 3). O write-through escreve `RedisKeys.tenantCfg(r.instancia)` com `r.config` (sem gateway — gateway é do registry).
- [ ] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(tenant-config): reconcile hidrata gateway do registry no snapshot (fonte p/ o router)`.

---

## Task 5: `EvolutionGoAdapter` (esqueleto @provisional)

**Files:** Create `apps/api/src/whatsapp/evolution-go.adapter.ts` (+spec).

- [ ] **Step 1: Testes** — `EvolutionGoAdapter implements EvolutionGateway`; toda chamada de envio/instância lança um erro claro apontando p/ a Fase 0 (ex.: `sendTextMessage` → rejeita com mensagem contendo `EvolutionGoAdapter` + `Fase 0`). Prova que o seam existe e falha ALTO (nunca silenciosamente errado).
- [ ] **Step 2: Rodar (falha).** — [ ] **Step 3: Implementar** — um helper privado `private nyi(m: string): never { throw new Error(\`EvolutionGoAdapter.${m} não implementado — pendente da captura do dialeto REST GO (Fase 0)\`); }` e cada método do port chama `this.nyi('<nome>')`.

```ts
@Injectable()
export class EvolutionGoAdapter implements EvolutionGateway {
  // @provisional: o dialeto REST da Evolution GO se captura na Fase 0 (com o
  // número de TESTE). Até lá, falha alto — nenhum tenant está em gateway='go'.
  async sendTextMessage(): Promise<Record<string, unknown>> { return this.nyi('sendTextMessage'); }
  // ...idem para os demais métodos do port...
  private nyi(m: string): never {
    throw new Error(`EvolutionGoAdapter.${m} não implementado — pendente do dialeto REST GO (Fase 0)`);
  }
}
```

- [ ] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(whatsapp): EvolutionGoAdapter (esqueleto @provisional, NotImplemented até Fase 0)`.

---

## Task 6: `EvolutionClient` vira o router (mesmo token) + wiring

**Files:** Rewrite `apps/api/src/whatsapp/evolution.client.ts` (+ `evolution.client.spec.ts` novo); Modify `whatsapp.module.ts`.

- [ ] **Step 1: Testes do router** — injeta node adapter (mock), go adapter (mock) e um resolver (mock com `gatewayFor`):
  - `gatewayFor→'node'` (default): `sendTextMessage('Shk',...)` chama o NODE adapter com os mesmos args; GO não é tocado.
  - `gatewayFor→'go'`: a mesma chamada vai ao GO adapter.
  - a resolução usa o 1º argumento (`instancia`) de cada método.
- [ ] **Step 2: Rodar (falha).** — [ ] **Step 3: Implementar** o router. Mantém a classe `EvolutionClient` (token inalterado); injeta os dois adapters + o `InMemoryGatewayConfigStore` (para `gatewayFor`). `pick(instancia)` é síncrono; cada método delega:

```ts
@Injectable()
export class EvolutionClient implements EvolutionGateway {
  constructor(
    @Inject(EVOLUTION_GATEWAY_NODE) private readonly node: EvolutionGateway,
    @Inject(EVOLUTION_GATEWAY_GO) private readonly go: EvolutionGateway,
    private readonly gateways: InMemoryGatewayConfigStore, // gatewayFor (sync, snapshot)
  ) {}
  private pick(instancia: string): EvolutionGateway {
    return this.gateways.gatewayFor(instancia) === 'go' ? this.go : this.node;
  }
  sendTextMessage(instancia: string, jid: string, text: string, quoted?: {id:string;text?:string}) {
    return this.pick(instancia).sendTextMessage(instancia, jid, text, quoted);
  }
  // ...delegação 1:1 para cada método do port (mecânico; instancia = 1º arg)...
}
```

- [ ] **Step 4: Wiring** em `whatsapp.module.ts`: importar `TenantConfigModule`; providers `[EvolutionNodeAdapter, EvolutionGoAdapter, { provide: EVOLUTION_GATEWAY_NODE, useExisting: EvolutionNodeAdapter }, { provide: EVOLUTION_GATEWAY_GO, useExisting: EvolutionGoAdapter }, EvolutionClient, WhatsAppService]`; manter `exports: [WhatsAppService, EvolutionClient]`. Os consumidores seguem resolvendo o token `EvolutionClient` — agora o router.
- [ ] **Step 5: Rodar (passa)** + `pnpm --filter @nexus/api lint` PASS. — [ ] **Step 6: Commit** — `feat(whatsapp): EvolutionClient router seleciona adapter por tenants.gateway (consumidores inalterados)`.

---

## Task 7: Suite verde + typecheck + review + PR

- [ ] **Step 1:** `pnpm --filter @nexus/api test` → PASS (incl. os 5 consumidores; nenhuma regressão — todos resolvem `node` por default). `pnpm --filter @nexus/shared test` → PASS.
- [ ] **Step 2:** `pnpm --filter @nexus/api lint` → PASS.
- [ ] **Step 3: Review** (spec §4.3/D7 + qualidade): confirmar que (a) o port cobre 100% da superfície antiga, (b) o Node é 1:1, (c) o router resolve por `instancia` e cai em `node` por default, (d) o GO falha alto. Corrigir; commit de ajustes.
- [ ] **Step 4:** Atualizar `2026-08-01-...roadmap.md` (Fatia 2.4 → 🔵; **Etapa 2 fecha 4/4** no software 🟢) e `docs/LOUSA.md`. Abrir PR contra `worktree-macos-reskin`. Commit `docs(plans): fecha Fatia 2.4 + Etapa 2 (software) no cronograma`.

---

## Portões manuais (🔒) desta fatia
- **Dialeto REST GO** (endpoints/payloads de envio, QR, estado) — capturar na **Fase 0** com o número de TESTE e **preencher o `EvolutionGoAdapter`** (trocar os `NotImplemented` pelas chamadas reais), validando pelo checklist de paridade (§7 Fase 0). Enquanto isso, nenhum tenant em `gateway='go'`.
- **Flip `gateway='go'`/`transport='amqp'`** por tenant — SQL no cutover (§7.1), com aval.

## Depende de / fecha
- **Depende de:** Fatia 2.3 (config store + reconcile + `tenants.gateway` da migration 0005).
- **Fecha:** a **Etapa 2** (Contrato + barramento) no lado software 🟢. Restam só os portões manuais da **Fase 0** (subir RabbitMQ + Evolution GO, capturar payloads, trocar `@provisional`, resolver os gates de robustez #2/#3/#4 da auditoria da 2.2) antes de ativar ponta a ponta.
