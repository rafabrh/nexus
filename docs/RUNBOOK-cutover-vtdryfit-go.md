# 🔀 RUNBOOK — Cutover vtdryfit: Evolution Node → Evolution GO

> Playbook **manual** para migrar o número do **sócio (tenant `vtdryfit`)** — que **já atende produção hoje** (Evolution Node → n8n → painel) — para o canal **Evolution GO**, com o **loop completo** (a IA volta a responder, agora pela GO).
>
> É a instância CONCRETA e corrigida do §9 do `RUNBOOK-fase-0.md`, para um tenant de PROD real (não o número de teste). **O que o §9 não cobre e este cobre:** (1) a resposta da IA sai do **n8n chamando a Evolution direto** → o nó de envio do n8n tem que apontar para a EvoGO; (2) pré-parear a GO ANTES do flip é seguro e serve de mini-checkpoint; (3) validar o **eco de saída** (a bolha da resposta da IA) pela GO.
>
> **Regra de ouro:** o webhook do n8n é sagrado; toda mudança é manual, com aval do Rafa, e tem rollback. Decisão do dono: cutover GO-only direto (sem fase paralela) — ver a bifurcação decidida na sessão.

---

## Por que este é o desenho (contexto travado)

- **A "volta" (resposta da IA) é enviada pelo n8n chamando a Evolution DIRETO** — não pelo painel (`webhook.service.ts`: `send.message` = "a mensagem que a PRÓPRIA IA enviou via Evolution API"). Logo, para a IA responder **pela GO**, o nó de envio do workflow do vtdryfit precisa chamar a **EvoGO** (mudança no n8n, `docs/n8n-workflow-atual.md`), não é mudança no painel.
- **Resposta dupla é evitada por design** — o forward pro n8n tem dedup por `(instancia, WAMID)` por 5 min (`n8n-forwarder.service.ts`). Mesmo com Node e GO vivos ao mesmo tempo, a IA não responde 2x.
- **MAS bolha dupla NÃO é evitada** — o dedup de boundary (`evtDedup`) só roda no caminho GO/RabbitMQ; o webhook HTTP do Node **pula** o dedup (`webhook.controller.ts`). Com os dois vivos, a mensagem recebida é **gravada 2x** no chat. Por isso o cutover é **GO-only** (logout do Node), e não paralelo.
- **Nenhuma mudança de código no painel** é necessária: consumer, router de saída (`EvolutionClient` roteia por `gateway`), `EvolutionGoAdapter` e o seed já estão em prod. O trabalho é ops (seed + flip + n8n + logout) — o consumer já está ligado (`QUEUE_CONSUMER_ENABLED=true`, confirmado).

---

## 0. Pré-requisitos (fora da janela — ZERO impacto na prod)

- [ ] **P1 — Consumer ligado.** ✅ Confirmado: `QUEUE_CONSUMER_ENABLED=true` + `RABBITMQ_URL` no nexus-api, filas GO com `consumers=1`. (Se em dúvida: `rabbitmqctl list_queues name messages consumers` — ver `reference_prod_ssh_access`.)
- [ ] **P2 — Parear a EvoGO no número do sócio AGORA** (scan do QR pela EvoGO Manager). Enquanto o `vtdryfit` continuar `gateway='node'`, o consumer **DROPA** os eventos GO com segurança (`resolveInstanceId → null` → `evt.normalizer-drop`, ACK). Ou seja: **pareamento adiantado é seguro, não duplica nada** e entra como **companion ADICIONAL** — o Node segue atendendo. Mini-checkpoint: dá para ver a EvoGO conectada e publicando (`GO_CAPTURE`/`GO_LATENCY` numa janela curta) ANTES de qualquer flip.
- [ ] **P3 — Capturar o `instanceId` (UUID) real + o `instanceToken`** via `/instance/all` na EvoGO. ⚠️ **O identificador anotado antes tinha formato de UUID INCOMPLETO** — confirmar o UUID real ao vivo; sem ele o roteamento não resolve.
- [ ] **P4 — Preparar (SEM ativar) a mudança do n8n.** No workflow do vtdryfit, o nó de envio da resposta passa a chamar a EvoGO em vez da Evolution Node:
  - `POST {EVOLUTION_GO_URL}/send/text`
  - header `apikey: <instanceToken>` (a instância GO se identifica pelo token, não por path/body)
  - body `{ "number": "<jid do cliente>", "text": "<resposta>" }`
  - (o dialeto GO está encapsulado em `evolution-go.adapter.ts`: `/send/media` usa `url`; não há `/send/audio`).

---

## 1. A janela (baixo tráfego, sócio de prontidão)

Fazer **J2→J4 o mais rápido possível** para minimizar o intervalo de bolha dupla.

- [ ] **J1 — Seed da config GO.** Rodar o bloco **J1** de `apps/api/src/tenant-config/seed/vtdryfit-go-cutover.sql` (preenche `tenant_engine_config` com `instanceId`/`ownerJid`/`instanceToken`). Ainda **não migra** (gateway continua 'node').
- [ ] **J2 — Flip.** Rodar o bloco **J2** do mesmo SQL: `UPDATE tenants SET gateway='go', transport='amqp' WHERE instancia=:instancia`. Forçar reconcile (aguardar `TENANT_CFG_RECONCILE_SEC`, default 60s) **ou** restart do nexus-api. A partir daqui: o consumer roteia GO→vtdryfit e o painel envia via GO.
  - **Gate:** logs do nexus-api **sem** o erro CRITICAL de `ISOLAMENTO` (UUID colidindo com outro tenant). Se aparecer, o roteamento fica desabilitado → conferir o `:go_uuid`.
- [ ] **J3 — Ativar a mudança do n8n** (P4): o envio da resposta passa a ir pela EvoGO.
- [ ] **J4 — Logout do companion Node.** No WhatsApp do sócio → Aparelhos conectados → deslogar o dispositivo do **Evolution Node**. Agora **só a GO entrega** → acaba a bolha dupla e o Node para de encaminhar.
- [ ] **J5 — Verificar E2E** (ver seção abaixo).

---

## 2. J5 — Verificação ponta a ponta

- [ ] **Recebimento:** cliente manda mensagem → aparece no painel (via fila GO). `wa_lag_ms` ~1,9 s (`GO_LATENCY=true`), `evt.count` subindo, **DLQ=0** (`rabbitmqctl list_queues`).
- [ ] **IA responde:** o n8n dispara e a resposta chega ao cliente **pela EvoGO**.
- [ ] ⚠️ **ECO DE SAÍDA (risco a validar ao vivo — não assumir):** confirmar que a **bolha da resposta da IA aparece no painel**. O painel pinta a bolha AI a partir do evento de saída da GO (`send.message`/`Message` fromMe=true). Se **não aparecer**, a EvoGO provavelmente **não publica** o evento de saída no AMQP — os `AMQP_SPECIFIC_EVENTS` configurados são `Message,Receipt,Presence,Connected,LoggedOut,Contact,PushName` (sem `SendMessage` explícito). **Fallback:** adicionar o evento de saída ao `AMQP_SPECIFIC_EVENTS` da EvoGO (se a GO suportar) e redeploy da EvoGO; reconfirmar. Isto NÃO afeta o cliente (ele recebe a resposta de qualquer jeito) — é só a bolha no painel do operador.
- [ ] **Receipts/ACK:** os tiques (entregue/lido) das mensagens de saída pintam no painel.
- [ ] **Critério de saída:** 24–48 h sem anomalia; histórico e realtime do vtdryfit pelo canal GO; comandos de admin (`/help`, `/tpl`) e bloqueio de IA ao vivo OK.

---

## 3. Rollback (se a GO vacilar)

O histórico do painel é **preservado** (mesmo tenant). Ordem:

- [ ] **R1** — reverter o nó de envio do n8n para a Evolution Node.
- [ ] **R2** — reverter o flip no Postgres: `UPDATE tenants SET gateway='node', transport='webhook' WHERE instancia=:instancia` (bloco de rollback do SQL) + reconcile/restart.
- [ ] **R3** — re-parear o companion **Node** no número (scan do QR na Evolution Node).
- [ ] **R4** — (opcional) logout do companion GO.
- Prod volta a rodar pelo Node. Nunca purgar fila compartilhada; nunca desativar o consumer para os demais tenants.

---

## Gaps aceitos / conhecidos

- **Bolha dupla no intervalo J2→J4** (Node ainda logado): cosmético; a IA não responde 2x (forward deduplicado). Minimizar com janela curta + baixo tráfego.
- **Eco de saída da IA** (item de J5): risco real a validar — pode exigir ligar o evento de saída no AMQP da EvoGO.
- **Presence (digitando)** não chega na EvoGO (gap upstream, não é do painel) — cosmético.
- **Sync de histórico da GO** degrada (`findChats/findMessages` retornam `[]`); não é necessário — o histórico do vtdryfit já existe no painel (veio do sync do Node) e as mensagens novas chegam por evento.

---

## Arquivos/flags de referência

| Item | Onde |
|---|---|
| Seed + flip do vtdryfit | `apps/api/src/tenant-config/seed/vtdryfit-go-cutover.sql` |
| Cutover genérico (base) | `docs/RUNBOOK-fase-0.md` §9 |
| Workflow n8n (envio → GO) | `docs/n8n-workflow-atual.md` |
| Router de saída / adapter GO | `apps/api/src/whatsapp/evolution.client.ts`, `evolution-go.adapter.ts` |
| Consumer + dedup | `apps/api/src/queue/` |
| Reconcile config | env `TENANT_CFG_RECONCILE_SEC` (default 60s) |
| Latência / captura | env `GO_LATENCY=true` / `GO_CAPTURE=true` (ligar em janela curta; `GO_CAPTURE` = dump integral, LGPD → desligar após) |
| SSH prod / rabbitmqctl | `reference_prod_ssh_access` (memória) |
