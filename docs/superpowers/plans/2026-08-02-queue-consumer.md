# Módulo queue/ — Consumer RabbitMQ do painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Fatia 2.2 da Etapa 2. Consumir eventos do RabbitMQ no painel via `EvolutionQueueConsumer` → `normalizeGatewayEvent` (Fatia 2.1) → dedup de boundary (48h) → `WebhookService.processEvolutionEvent` — tirando o painel do caminho crítico (buffer durável), com kill-switch. O boundary HTTP legado também passa a normalizar (§4.3), virando fallback real.

**Architecture:** Módulo NestJS novo (`apps/api/src/queue/`). Reusa o `WebhookService.processEvolutionEvent()` EXISTENTE (não muda a lógica de processamento). O consumer só orquestra: normaliza → deduplica → delega. A conexão AMQP real é **portão manual 🔒** (RabbitMQ no EasyPanel, Fase 0); TODA a lógica é unit-testável sem broker (deps mockadas). Registro do consumer é gated por `QUEUE_CONSUMER_ENABLED`.

**Tech Stack:** NestJS, `@golevelup/nestjs-rabbitmq` (+ `amqp-connection-manager`), ioredis, Vitest. Contrato `NexusEventV1` + `normalizeGatewayEvent` + `RedisKeys.evtDedup/evtCount` de `@nexus/shared` (Fatia 2.1, PR #20 — **este plano depende do merge do #20**).

**Invariantes (não quebrar):**
- **`WebhookService.processEvolutionEvent` NÃO muda** — o consumer entrega o payload v1 e o service faz o resto igual ao webhook HTTP hoje.
- **Dedup por tipo (§4.4):** só `messages.upsert` e `send.message` deduplicam (reprocessar faz `rpush` duplicar histórico). `messages.update`/`connection.update`/`contacts.*`/`presence.update` são idempotentes → **passam sempre** (nunca dedupar por `id`, que vem vazio em connection). TTL 48h (cobre religar pós kill-switch — spec §4.4).
- **Best-effort/erro:** payload venenoso ou tenant sem config → `nack` → DLQ + log; nunca trava a fila. Normalizer `null` → **ack** + log `evt.normalizer-drop` (fora de contrato por design, NÃO é erro).
- **Kill-switch:** `QUEUE_CONSUMER_ENABLED=false` (default) → o consumer NÃO se registra na fila (nada consome). Ativação só após RabbitMQ no ar.
- **Boundary HTTP idempotente:** normalizar no controller HTTP é custo ~zero (mesma função pura, Node=identidade) e não muda o comportamento do fluxo Node atual.
- **Dependência da Fatia 2.3 (config store):** o `ctx.ownerJid` e o mapa `instanceId→instancia` da GO vêm do config store. Este plano entrega o caminho **Node** completo (Node traz `sender` no payload; `resolveInstance` = `raw.instance`) e deixa a resolução GO atrás do seam `NormalizeContextProvider`, cabeada quando a 2.3 chegar. GO só entra ao vivo na Fase 0 (🔒).

**Nota de commit:** `apps/**` fora do `.gitignore`. Identidade `rafabrh`, sem trailers do Claude. Branch `feat/queue-consumer` off `worktree-macos-reskin` (após #20 mergeado). Após mudar `packages/shared`, `npm run build --prefix packages/shared` antes do typecheck do apps/api.

---

## File Structure

- **Modify** `apps/api/package.json` — deps `@golevelup/nestjs-rabbitmq`, `amqp-connection-manager`.
- **Modify** `apps/api/src/core/config/app.config.ts` — `RABBITMQ_URL?`, `QUEUE_CONSUMER_ENABLED` (default 'false'), `QUEUE_PREFETCH` (default 10).
- **Create** `apps/api/src/queue/event-dedup.service.ts` (+spec) — política de dedup por tipo + `evtCount`.
- **Create** `apps/api/src/queue/normalize-context.provider.ts` (+spec) — monta `NormalizeContext` por evento (Node completo; GO seam).
- **Create** `apps/api/src/queue/evolution-queue.consumer.ts` (+spec) — handler normalize→dedup→delegate→ack/nack + kill-switch.
- **Create** `apps/api/src/queue/queue.module.ts` — `RabbitMQModule` + providers, registro gated.
- **Modify** `apps/api/src/webhook/webhook.module.ts` — `exports: [WebhookService]` (o consumer precisa injetar).
- **Modify** `apps/api/src/webhook/webhook.controller.ts:53` — normalizar o payload (Node ctx) antes do `processEvolutionEvent` (§4.3).
- **Modify** `apps/api/src/app.module.ts` — importar `QueueModule`.

---

## Task 1: Dependências + config

**Files:** Modify `apps/api/package.json`, `apps/api/src/core/config/app.config.ts`.

- [x] **Step 1:** `npm install @golevelup/nestjs-rabbitmq amqp-connection-manager --prefix apps/api` (fixar versões compatíveis com Nest 10; conferir `npm ls`).
- [x] **Step 2:** Adicionar ao `AppConfig` (mesmo estilo dos flags existentes): `RABBITMQ_URL?: string` (@IsOptional @IsString); `QUEUE_CONSUMER_ENABLED: string = 'false'`; `QUEUE_PREFETCH: number = 10` (@Type Number @Min(1)).
- [x] **Step 3:** `npm run lint --prefix apps/api` → PASS.
- [x] **Step 4:** Commit — `chore(queue): deps @golevelup/nestjs-rabbitmq + config do consumer`.

---

## Task 2: `EventDedupService` (política por tipo + TTL 48h)

**Files:** Create `apps/api/src/queue/event-dedup.service.ts` (+spec). TDD.

- [x] **Step 1: Testes que falham**

```ts
// messages.upsert: 1ª chamada shouldProcess=true (SET NX ok); 2ª=false (chave existe)
// send.message: mesma política
// messages.update / connection.update / presence.update / contacts.update: SEMPRE true, redis.set NUNCA chamado (não deduplica)
// TTL: SET usa EX 48*3600
```

- [x] **Step 2: Rodar (falha).**
- [x] **Step 3: Implementar**

```ts
const DEDUP_EVENTS = new Set(['messages.upsert', 'send.message']);
const TTL_SEC = 48 * 3600;

@Injectable()
export class EventDedupService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** true = processar; false = duplicata (descartar). Só messages.upsert/send.message
   * deduplicam (§4.4); os demais são idempotentes e passam sempre. */
  async shouldProcess(instancia: string, event: string, msgId: string): Promise<boolean> {
    if (!DEDUP_EVENTS.has(event)) return true;
    const key = RedisKeys.evtDedup(instancia, event, msgId);
    const acquired = await this.redis.set(key, '1', 'EX', TTL_SEC, 'NX');
    return acquired != null; // 'OK' = 1ª vez → processa; null = duplicata
  }
}
```

- [x] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(queue): EventDedupService (dedup por tipo, TTL 48h)`.

---

## Task 3: `NormalizeContextProvider`

**Files:** Create `apps/api/src/queue/normalize-context.provider.ts` (+spec). TDD.

Monta o `NormalizeContext` para um evento cru. **Node completo agora**; GO deixa `resolveInstance`/`ownerJid` num seam a cabear pela Fatia 2.3 (config store).

- [x] **Step 1: Teste** — `contextFor('node', raw)` devolve ctx com `resolveInstance` = `raw.instance`; `ownerJid` undefined (Node traz sender). Para `'go'`, `resolveInstance` usa um mapa injetado (mock) `instanceId→instancia` e `ownerJid` via mapa injetado — hoje ambos vazios (devolvem null/undefined), documentado como pendente da 2.3.
- [x] **Step 2/3: Implementar** — provider injetável recebendo (futuramente) o config store; por ora um mapa vazio + TODO cross-ref à Fatia 2.3. Node não depende de nada externo.
- [x] **Step 4/5:** rodar + commit — `feat(queue): NormalizeContextProvider (Node completo; seam GO p/ config store)`.

---

## Task 4: `EvolutionQueueConsumer` (handler)

**Files:** Create `apps/api/src/queue/evolution-queue.consumer.ts` (+spec). TDD. **Sem AMQP real** — testa o método `handle(raw, gateway)` diretamente com deps mockadas.

- [x] **Step 1: Testes**
  - normalizer devolve `null` → NÃO chama processEvolutionEvent; loga `evt.normalizer-drop`; retorna ack.
  - evento válido, dedup `shouldProcess=true` → chama `processEvolutionEvent(v1)`; ack.
  - dedup `false` (duplicata) → NÃO chama process; loga `evt.dedup-hit`; ack.
  - `processEvolutionEvent` lança → propaga p/ nack→DLQ (o handler NÃO engole; loga `evt.nack-dlq`).
  - `QUEUE_CONSUMER_ENABLED=false` → o handler nem roda (registro gated no módulo; teste do gate no Task 5).
- [x] **Step 2: Rodar (falha).**
- [x] **Step 3: Implementar** o método puro de orquestração (sem decorators AMQP ainda):

```ts
async handle(raw: RawGatewayEvent, gateway: 'node' | 'go'): Promise<void> {
  const ctx = this.ctxProvider.contextFor(gateway, raw);
  const v1 = normalizeGatewayEvent(raw, ctx);
  if (!v1) { this.logger.debug(`evt.normalizer-drop gateway=${gateway}`); return; } // ack
  const ok = await this.dedup.shouldProcess(v1.instance, v1.event, v1.data.key.id);
  if (!ok) { this.logger.debug(`evt.dedup-hit ${v1.instance} ${v1.event}`); return; } // ack
  await this.service.processEvolutionEvent(v1 as unknown as Record<string, unknown>); // erro → nack/DLQ
}
```

  A anotação `@RabbitSubscribe` (fila `nexus.panel.events`, prefetch, `errorHandler` → nack) fica no Task 5, chamando `handle`. Manter `handle` público e testável.
- [x] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(queue): EvolutionQueueConsumer.handle (normalize→dedup→delegate)`.

---

## Task 5: `QueueModule` + wiring (registro gated)

**Files:** Create `apps/api/src/queue/queue.module.ts`; Modify `apps/api/src/webhook/webhook.module.ts` (export `WebhookService`), `apps/api/src/app.module.ts` (import `QueueModule`).

- [x] **Step 1:** `WebhookModule` passa a `exports: [WebhookService]`.
- [x] **Step 2:** `QueueModule`: importa `WebhookModule`; `RabbitMQModule.forRootAsync` lê `RABBITMQ_URL` (exchange topic `evolution`); provê `EventDedupService`, `NormalizeContextProvider`, `EvolutionQueueConsumer`. **Registrar a subscription só quando `QUEUE_CONSUMER_ENABLED==='true'`** (kill-switch — condicional no provider/subscription). Se `RABBITMQ_URL` ausente, o módulo sobe sem consumer (não quebra o boot local/prod atual).
- [x] **Step 3:** `@RabbitSubscribe` na `nexus.panel.events` chamando `consumer.handle(msg, 'go')` (a fila carrega GO nas fases 1+; Node segue por HTTP). `errorHandler` faz nack→DLQ (`nexus.dlx`).
- [x] **Step 4:** Teste do gate: com `QUEUE_CONSUMER_ENABLED=false`, o app compila e sobe sem registrar subscription (teste de módulo/boot). Import no `AppModule`.
- [x] **Step 5:** `npm run lint --prefix apps/api` PASS. Commit — `feat(queue): QueueModule + subscription gated por kill-switch`.

---

## Task 6: Boundary HTTP também normaliza (§4.3)

**Files:** Modify `apps/api/src/webhook/webhook.controller.ts:53`.

- [x] **Step 1: Teste** (estender o spec do controller): payload Node passa por `normalizeGatewayEvent(payload, nodeCtx)` e o resultado (identidade) vai ao `processEvolutionEvent`; payload que normaliza p/ `null` (fora de contrato) NÃO chama o service (ack silencioso). Comportamento Node atual inalterado.
- [x] **Step 2: Rodar (falha).**
- [x] **Step 3: Implementar** — no `@Post('evolution')`, montar `nodeCtx` (`resolveInstance`=`payload.instance`) e `const v1 = normalizeGatewayEvent(payload, nodeCtx); if (v1) await this.service.processEvolutionEvent(v1 as ...)`. Torna o webhook da GO um fallback real e unifica o boundary.
- [x] **Step 4: Rodar (passa).** — [ ] **Step 5: Commit** — `feat(webhook): boundary HTTP normaliza via NexusEventV1 (fallback unificado, §4.3)`.

---

## Task 7: Suite verde + typecheck + review

- [x] **Step 1:** `npm test --prefix apps/api` → PASS (incl. pré-existentes; nenhuma regressão no webhook).
- [x] **Step 2:** `npm run lint --prefix apps/api` → PASS.
- [x] **Step 3:** Review final (spec compliance + code quality) da fatia; corrigir; commit de ajustes.
- [x] **Step 4:** Atualizar o CRONOGRAMA VIVO (`2026-08-01-...roadmap.md`): Fatia 2.2 → 🔵/✅. Abrir PR contra `worktree-macos-reskin`.

---

## Portões manuais (🔒) desta fatia
- Subir **RabbitMQ** (EasyPanel `siteshkgroup`, `rabbitmq:3-management`), pré-declarar `nexus.panel.events` + DLX `nexus.dlx`/`*.dlq`.
- `RABBITMQ_URL` + `QUEUE_CONSUMER_ENABLED=true` só APÓS o broker no ar e validado com o número de TESTE (Fase 1).
- A resolução GO (`ctx.ownerJid`, `instanceId→instancia`) fica pendente da **Fatia 2.3 (config store)** — até lá o consumer processa Node; GO ao vivo só na Fase 0.
