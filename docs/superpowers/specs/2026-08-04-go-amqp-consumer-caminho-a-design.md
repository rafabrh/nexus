# Spec — Caminho A: consumer AMQP lê as filas reais da Evolution GO 0.7.2

> **Data:** 2026-08-04 · **Fase:** 0 / passo 8 · **Branch:** `worktree-macos-reskin`
> **Escopo:** `apps/api/src/queue/` (consumer RabbitMQ). Pipeline `normalize → dedup → processEvolutionEvent` inalterado.

## Contexto e descobertas (capturadas ao vivo, não assumidas)

Ligamos a Evolution GO (`evoapicloud/evolution-go:0.7.2`) no RabbitMQ do EasyPanel
(`siteshkgroup_rabbitmq`) e capturamos o comportamento real do AMQP. Três achados
que **invalidam a suposição original** do RUNBOOK (que a GO publicaria num exchange
topic `evolution`):

1. **A GO NÃO usa exchange.** `pkg/events/rabbitmq/rabbitmq_producer.go` publica com
   `channel.Publish("", queueName, …)` — **exchange default**, routing key = **nome
   da fila**. Não existe `ExchangeDeclare`. As filas são **por evento**
   (`message`, `receipt`, `presence`, `connected`, `loggedout`, `contact`,
   `pushname`), **quorum + `x-ha-policy:all`, SEM DLX, SEM `x-delivery-limit`**.

2. **Bug de case no `AMQP_SPECIFIC_EVENTS`.** `SendToGlobalQueues` casa o evento com
   `utils.Find(specificEvents, eventType)` — comparação **exata** (`item == val`). O
   whatsmeow emite `eventType` **capitalizado** (`Message`, `Receipt`, `Connected`…).
   Lista em minúsculo → nunca casa → **cria as filas mas não publica**. Correção: a
   env deve usar os nomes capitalizados: `Message,Receipt,Presence,Connected,LoggedOut,Contact,PushName`.
   (Os nomes das FILAS seguem minúsculos porque o código faz `ToLower` nas duas pontas.)

3. **`normalizeGo` já fala o corpo AMQP verbatim.** O corpo publicado é o `postMap`
   cru: `{ event, data, instanceId, instanceName, instanceToken, state? }`. As
   fixtures (`go.fixtures.ts`) foram capturadas exatamente nesse envelope — o
   WebSocket é que embrulha em `{queue, payload}`; o AMQP manda cru. **Zero mudança de
   normalização.** `resolveInstance` lê `raw.instanceId` (UUID) e o config store
   mapeia p/ o nome canônico (seed `2.3-go-tenant.sql`).

**Conclusão:** o gap é só **topologia do consumer**. Hoje ele assina `exchange:'evolution'`
+ fila única `nexus.panel.events` (bind `#`) — que a GO nunca alimenta.

## Desenho aprovado

### Consumer (`evolution-queue.consumer.ts`)
- Assina, no **exchange default**, as filas da GO: `message`, `receipt`, `connected`,
  `loggedout`, `contact`, `pushname`, `presence`. Cada `@RabbitSubscribe` chama o
  `handle(raw, 'go')` existente (que roteia por `raw.event`, ignora o nome da fila).
- **Subscribe passivo** (`createQueueIfNotExists: false`, sem `exchange`) — não
  redeclara as filas da GO (evita `PRECONDITION_FAILED` por args divergentes).

### Tratamento de erro (`goQueueErrorHandler`, `MessageErrorHandler`)
As filas da GO não têm DLX, então o retry/DLQ vira **app-side**, usando o contador
nativo da quorum queue:
- Lê `msg.properties.headers['x-delivery-count']` (ausente na 1ª entrega → 0).
- `< QUEUE_DELIVERY_LIMIT` (default 5) → `channel.nack(msg, false, true)` (requeue; a
  quorum reconta).
- `>= limite` → `channel.sendToQueue('nexus.panel.events.dlq', msg.content, {persistent})`
  + `channel.ack(msg)`. A `nexus.panel.events.dlq` já existe no broker.
- A marca de dedup já é liberada no `catch` do `handle` (anti-perda) antes do rethrow,
  então o errorHandler é lógica pura de channel/msg.

### Código morto removido
Exchange `evolution` (do `queue.module.ts` e `queue.topology.ts`), fila
`nexus.panel.events` e `panelEventsQueueArguments` — a GO usa o default exchange.

## Testes
- `queue.topology.spec.ts`: `GO_EVENT_QUEUES`, `DLQ_QUEUE`, `resolveDeliveryLimit`.
- `go-queue-error-handler.spec.ts` (novo): `<limite`→nack requeue; `>=limite`→sendToQueue(DLQ)+ack.
- `evolution-queue.consumer.spec.ts`: wiring — cada subscription na fila GO (default
  exchange, `createQueueIfNotExists:false`, `errorHandler=goQueueErrorHandler`);
  testes de pipeline do `handle` permanecem.
- e2e gated no broker → validação ao vivo com as ~21 msgs reais já enfileiradas.

## Rollout (manual, no deploy)
1. Rodar o seed `2.3-go-tenant.sql` (`instanceId 22a04a5a-… → nexus_teste` + ownerJid + token).
2. `RABBITMQ_URL=amqp://nexus:%40Ricky22033@siteshkgroup_rabbitmq:5672` +
   `QUEUE_CONSUMER_ENABLED=true` no `nexus-api` → deploy.
3. As msgs enfileiradas drenam e viram histórico. Kill-switch: `QUEUE_CONSUMER_ENABLED=false`.
