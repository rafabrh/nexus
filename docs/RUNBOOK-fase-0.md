# 🔧 RUNBOOK — Fase 0 (infra + captura Evolution GO + ativação da fila)

> Playbook **manual** (executado por você, no EasyPanel + SQL). A Fase 0 destrava o canal **Evolution GO** e o **consumer RabbitMQ** que já estão em prod porém **gated/off**. Nada aqui muda produção até você ligar os flags no fim — cada passo tem gate de validação e rollback.
>
> **Contexto:** o software das Etapas 1–2 está em prod. O canal 1:1 continua rodando pela Evolution **Node** (webhook→painel→N8N) o tempo todo — a Fase 0 sobe o GO **em paralelo, com número de TESTE**, e só migra um tenant no cutover (último passo).
>
> **Regra de ouro:** o webhook do N8N na Evolution é sagrado — nunca sobrescrever. Toda mudança em qualquer gateway é manual, com seu aval.

> ⚠️ **CORREÇÃO 2026-08-04 (captura ao vivo invalidou suposições dos passos 1, 2 e 8).** A Evolution GO 0.7.2 **NÃO usa exchange topic `evolution`** — publica no **EXCHANGE DEFAULT** (routing key = nome da fila), em **filas por evento minúsculas** (`message`,`receipt`,`presence`,`connected`,`loggedout`,`contact`,`pushname`), **quorum sem DLX**. Portanto: **não** pré-declarar `evolution`/`nexus.panel.events` (passo 1) nem apontar a instância a um exchange (passo 2). Config real da GO (compose `nexus-evogo`, aba Fonte): `AMQP_URL="amqp://nexus:%40Ricky22033@siteshkgroup_rabbitmq:5672"` (senha `@`→`%40`, **sem barra final**=vhost `/`), `AMQP_GLOBAL_ENABLED="true"`, `AMQP_SPECIFIC_EVENTS="Message,Receipt,Presence,Connected,LoggedOut,Contact,PushName"` (**capitalizado** — a GO casa case-sensitive; minúsculo cria as filas mas não publica). Pegadinha: `CONNECT_ON_STARTUP:"false"` derruba a sessão a cada redeploy. O consumer foi reescrito (**Caminho A**, commit `55dfa89`) p/ assinar essas filas no default exchange, com cap de retry app-side via `x-delivery-count`→`nexus.panel.events.dlq`. **Desenho corrigido: `docs/superpowers/specs/2026-08-04-go-amqp-consumer-caminho-a-design.md`.** Passo 8 vira só: seed `2.3` → `RABBITMQ_URL`+`QUEUE_CONSUMER_ENABLED=true` no nexus-api → deploy.

---

## 0. Pré-requisitos e decisões

- [ ] **Licença Evolution GO** ativada (o servidor de licença tem heartbeat tolerante a offline).
- [ ] **Número de TESTE** separado (NÃO usar número de produção de cliente) para parear na GO.
- [ ] Acesso ao EasyPanel (projeto `siteshkgroup`) e ao Postgres de prod (para o seed/flip via SQL).
- [ ] Decidir hospedagem do broker: **RabbitMQ no próprio EasyPanel** (`rabbitmq:3-management`) é o suficiente para o piloto. Managed/k8s só quando o load test pedir.

---

## 1. Subir o RabbitMQ (broker)

- [ ] No EasyPanel, criar serviço `rabbitmq:3-management` (porta 5672 AMQP + 15672 UI).
- [ ] Definir user/senha; montar a `RABBITMQ_URL` no formato `amqp://user:senha@host:5672`.
- [ ] **Pré-declarar a topologia** (pela UI 15672 ou script), batendo com o que o consumer espera (`apps/api/src/queue/`):
  - Exchange **`evolution`** — tipo **topic**, durable.
  - Exchange **`nexus.dlx`** — tipo topic/fanout, durable (dead-letter).
  - Fila **`nexus.panel.events`** — durable, com `x-dead-letter-exchange = nexus.dlx` e `x-dead-letter-routing-key = nexus.panel.events.dlq`.
  - Fila **`nexus.panel.events.dlq`** — durable, bind no `nexus.dlx`.
  - Binding: `nexus.panel.events` ← `evolution` com routing key `#` (o consumer usa `@RabbitSubscribe routingKey '#'`).
- [ ] **Gate:** UI do RabbitMQ mostra as 2 exchanges + 2 filas. **Ainda NÃO** setar `RABBITMQ_URL` no nexus-api (o consumer sobe só no passo 8).
- [ ] **Rollback:** deletar o serviço RabbitMQ (nada no painel depende dele enquanto `QUEUE_CONSUMER_ENABLED=false`).

---

## 2. Subir a Evolution GO

- [ ] No EasyPanel, subir a Evolution **GO** (whatsmeow) com **Postgres próprio** (sessões) + **MinIO/S3** (mídia) + licença.
- [ ] Habilitar o **AMQP da instância** apontando para o exchange `evolution` do broker do passo 1 (config da própria Evolution GO — NÃO no painel).
- [ ] **Gate:** container GO sobe, conecta no Postgres/MinIO, licença OK.
- [ ] **Rollback:** desligar o container GO. A produção Node segue intacta.

---

## 3. Parear o número de TESTE (QR)

- [ ] Criar a instância de teste na GO e parear o número de TESTE via QR (fora do painel, direto na GO nesta fase).
- [ ] **Gate:** número conectado; a GO começa a publicar eventos no exchange `evolution`.
- [ ] Validar o **comportamento do sync pós-pareamento** (a GO reidrata histórico ao parear — confirmar que não gera enxurrada/lixo).

---

## 4. Capturar os payloads reais (o coração da Fase 0)

> As fixtures douradas do normalizer e o adapter GO dependem de payload **capturado**, não assumido. Não pule.

### 4a. Eventos AMQP (entrada)
- [ ] Ligue uma **fila de inspeção** (ou consuma `nexus.panel.events` cru pela UI) e provoque, com o número de teste, um exemplo de cada evento e **salve o JSON**:
  - `Message` (recebida), `SendMessage` (envio), `Receipt` (Delivered/Read), `Connected`/`LoggedOut`, `Contact`/`PushName`, `Presence`/`ChatPresence`.
- [ ] Documentar o **naming AMQP** (routing key real por evento/instância) e o **shape** de cada um (especialmente `Info.*`, `instanceId` UUID, `instanceToken`).

### 4b. Dialeto REST GO (saída)
- [ ] Testar e anotar (rota + payload + resposta) cada endpoint que o painel usa hoje no Node, no equivalente GO: enviar **texto**, **mídia** (imagem/vídeo/doc), **áudio PTT**, **contato**, **localização**; **QR/connect**, **connectionState**, **findMessages**, **getBase64FromMediaMessage**, **fetchProfilePictureUrl**, **createInstance/deleteInstance**.
- [ ] **Gate de paridade (§7):** cobrir texto, mídia in/out, áudio PTT, citação/reply, reação, ACKs, self-chat, **LID** (`SenderAlt`), **grupos** (msg de grupo não quebra histórico/engine e o gate as ignora).
- [ ] **Reprovou a paridade?** → **plano B**: manter o producer Node (v2 da spec de desacoplamento) **sem mudar a arquitetura**. Não force a GO.

---

## 5. Trocar as fixtures `@provisional` + validar o normalizer

- [ ] Substituir as fixtures GO provisórias em `packages/shared/src/gateway/fixtures/go.fixtures.ts` pelos **payloads capturados** em 4a.
- [ ] Rodar `pnpm --filter @nexus/shared test`. Se a tabela dourada quebrar, ajustar `normalizeGo` em `packages/shared/src/gateway/normalize-gateway-event.ts` para casar com o payload real.
- [ ] **Gate:** 33+ testes do shared verdes com fixtures reais.

---

## 6. Preencher o `EvolutionGoAdapter`

- [ ] Em `apps/api/src/whatsapp/evolution-go.adapter.ts`, trocar cada `this.nyi(...)` pela **chamada REST GO real** capturada em 4b (mesma superfície do port).
- [ ] ⚠️ **Finding da auditoria 2.4 (não esquecer):** o `probeState` do GO deve **retornar `{ status: 'unknown' }`** (degradar) quando não conseguir determinar o estado, **em vez de lançar** — senão quebra o `connection-reconciler.service` no 1º tenant GO. O contrato tri-estado já prevê `unknown`.
- [ ] Escrever/rodar os specs do go adapter contra o dialeto real. **Gate:** suíte `apps/api` verde.

---

## 7. Resolver os gates de robustez (auditoria 2.2) — ANTES de ligar em escala

- [ ] **#2 Retry vs DLQ:** hoje o `errorHandler` (`defaultNackErrorHandler`) manda falha direto ao DLQ **sem retry**. Trocar por retry limitado antes do dead-letter: **quorum queue com `x-delivery-limit`** (recomendado) **ou** retry-queue com TTL + DLX, contando `x-death`. Evita despejar mensagens boas na DLQ num blip de Redis/Postgres.
- [ ] **#3 Impedância de shape v1-GO ↔ `processEvolutionEvent`:** com os payloads reais, confirmar que `connection.update`/`contacts.update` GO **normalizados** batem com o que o `WebhookService` lê (`data.instance.state`, `data` array em contacts). Ajustar o normalizer GO **ou** o service. Validar ao vivo com o número de teste (ex.: `Connected` GO precisa virar `open`, não `close`).
- [ ] **#4 Cache do `tenants.get`:** hoje são 2 queries Postgres por evento (`webhook.service.ts`). Cachear o lookup de tenant (Redis, TTL curto ~60s, invalidando em `register`/`updateState`) antes de ligar o consumer em volume.

---

## 8. Config do tenant GO + ligar o consumer

- [ ] **Seed da config** com os valores capturados: usar `apps/api/src/tenant-config/seed/2.3-go-tenant.sql` preenchendo `:instancia` (nome canônico), `:go_uuid` (instanceId UUID da GO) e `:owner_jid`. Rodar no Postgres de prod.
- [ ] **Confirmar a hidratação:** após o próximo reconcile (≤ `TENANT_CFG_RECONCILE_SEC`, default 60s) ou restart do nexus-api, checar `tenant:cfg:<instancia>` no Redis e que o snapshot resolve `instanceId→instancia` + `ownerJid`.
- [ ] **Ligar o consumer** no nexus-api (EasyPanel → env): `RABBITMQ_URL=amqp://...` **e** `QUEUE_CONSUMER_ENABLED=true` (opcional: `QUEUE_PREFETCH`). Redeploy.
- [ ] **Gate:** logs de boot mostram o consumer registrado (não mais "consumer OFF"); `/health` reporta AMQP; ponta a ponta no **número de TESTE** funciona pelo painel (histórico, realtime, envio). Produção Node intocada e saudável.
- [ ] **Rollback (kill-switch):** `QUEUE_CONSUMER_ENABLED=false` + redeploy — o consumer para de consumir; o backlog fica na fila (durável) e drena pelo dedup 48h ao religar.

---

## 9. Cutover do piloto (§7.1) — só depois de TUDO validado no teste

> Janela curta, fora de horário. Migra UM tenant do Node para o GO.

1. [ ] (Opcional) Purga da fila do engine se aplicável (piloto).
2. [ ] **Flip** no registry (SQL): `UPDATE tenants SET gateway='go', transport='amqp' WHERE instancia=:instancia;` — o router de saída passa a usar o GO adapter para esse tenant; o forwarder para de entregar ao fluxo v1.
3. [ ] **Re-parear** o chip do tenant na GO (QR; janela de minutos). *Nuance:* entre o flip e o logout do Node, o Node ainda entrega webhooks — essas msgs ganham histórico mas não vão ao engine (aceito na janela curta).
4. [ ] Desabilitar o webhook Node do tenant **após estabilizar**.
5. [ ] **Critério de saída:** `/help`/`/tpl` e bloqueio de IA ao vivo; 48h sem anomalia; painel exibindo histórico/realtime do tenant via fila.
6. [ ] **Rollback por tenant:** re-parear de volta na Node + flip reverso (`gateway='node', transport='webhook'`) → o fluxo v1 reativa. (Nunca purgar a fila compartilhada; nunca desativar o engine.)

---

## Flags/arquivos de referência

| Item | Onde |
|---|---|
| Kill-switch consumer | env `QUEUE_CONSUMER_ENABLED` (default `false`), `RABBITMQ_URL`, `QUEUE_PREFETCH` |
| Reconcile config | env `TENANT_CFG_RECONCILE_SEC` (default `60`) |
| Fixtures GO | `packages/shared/src/gateway/fixtures/go.fixtures.ts` |
| Normalizer | `packages/shared/src/gateway/normalize-gateway-event.ts` |
| GO adapter | `apps/api/src/whatsapp/evolution-go.adapter.ts` |
| Seed tenant GO | `apps/api/src/tenant-config/seed/2.3-go-tenant.sql` |
| Consumer + topologia | `apps/api/src/queue/` (exchange `evolution`, fila `nexus.panel.events`, DLX `nexus.dlx`) |

**Ordem dos gates:** 1→2→3 (infra) · 4→5→6 (captura + adapter) · 7 (robustez) · 8 (ligar no teste) · 9 (cutover). Não pular o 4 (captura) nem o 7 (robustez).

---

## 🛡️ Robustez & operação do consumer (pós-incidente 2026-08-04)

**O que aconteceu:** ao ligar o consumer, TODOS os eventos GO foram pra DLQ. Causa: os **providers globais** do NestJS (`APP_GUARD` throttler+jwt, `useGlobalFilters`) assumiam HTTP e rodavam também no `@RabbitSubscribe` → `res.header`/`reply.status is not a function` → falha antes da lógica. Corrigido (`c275f11`, `eb0613d`): guards retornam `true` e filters re-lançam em `getType() !== 'http'`.

**Invariante travada (não re-litigar):** todo provider global cross-cutting (`APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR`/global pipe) DEVE ser context-aware — pula/re-lança em contexto não-HTTP. Cada um tem teste com `getType: () => 'rmq'`. Ao adicionar um novo global HTTP-only, adicione o skip **e** o teste. Cobertura: `*.guard.spec.ts`, `*.filter.spec.ts`, e `apps/api/src/queue/evolution-queue.consumer.integration.spec.ts` (pipeline real com payloads GO capturados).

**Rollout OBSERVADO (ao ligar `QUEUE_CONSUMER_ENABLED`):**
1. Deploy → **olhar a DLQ nos primeiros ~2 min**: `rabbitmqctl list_queues name messages consumers`.
2. Filas GO com `consumers 1` e `messages ~0` = OK. **`nexus.panel.events.dlq` crescendo = ABORTAR** (kill-switch `QUEUE_CONSUMER_ENABLED=false` + redeploy) e olhar a causa.
3. Diagnóstico da DLQ sem caçar log: `rabbitmqadmin -u nexus -p <senha> get queue=nexus.panel.events.dlq count=1 ackmode=ack_requeue_true` — cada msg carrega os headers **`x-error`/`x-error-stack`/`x-original-queue`** (gravados pelo `goQueueErrorHandler`).

**Alerta de DLQ (ops, sem código no app):** o próprio RabbitMQ expõe a profundidade nativamente — alertar em `rabbitmq_queue_messages{queue="nexus.panel.events.dlq"} > 0` (prometheus plugin) ou olhar a UI de management. Não criar gauge no app (redundante).

**Replay da DLQ:** as msgs falhas ficam na `nexus.panel.events.dlq` (durável). Após corrigir a causa, republicar cada uma na fila de origem pelo `x-original-queue` (script `rabbitmqadmin publish` / shovel). Para o piloto, se for só ruído (ex.: flood de `Connected`), `rabbitmqctl purge_queue nexus.panel.events.dlq` e reenviar msgs de teste.

**Follow-up GO-side (não é bug do painel):** flood de `Connected` (300+) = instância GO em loop de reconexão. `connection.update` no painel é idempotente (só publica na transição), então não corrompe — é ruído. Investigar o flap na GO (`CONNECT_ON_STARTUP`, WS idle 1006).
