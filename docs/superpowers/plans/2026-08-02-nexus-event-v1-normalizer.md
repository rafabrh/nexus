# NEXUS Event v1 + normalizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promover o shape de evento que painel e fluxo já falam a um **contrato versionado `NexusEventV1`** em `packages/shared`, com uma função pura `normalizeGatewayEvent(raw, ctx) → NexusEventV1 | null` que traduz Node (identidade) e Evolution GO (mapeamento whatsmeow→v1) para o mesmo contrato, testada por uma **tabela dourada de fixtures**.

**Architecture:** Etapa 2 (Contrato + barramento) do programa de escala. Este plano entrega SÓ o contrato + normalizer — a fundação da qual o consumer do painel (`apps/api/src/queue/`) e o engine dependem (D12: "consumidores só falam v1"). Função pura, sem infra, sem DI: 100% testável agora. O consumer RabbitMQ, o dedup e o config store são planos separados que consomem este.

**Tech Stack:** TypeScript, monorepo `@nexus/shared` (build `tsc`, consumido via `dist` por `apps/api` e via alias `src` por `apps/web`), Vitest.

**Fonte:** spec `docs/superpowers/specs/2026-07-17-desacoplamento-rabbitmq-design.md` §4.7 (contrato) e §4.2 (shape GO whatsmeow). Decisão D12.

**Invariantes (não quebrar):**
- **Node → v1 é identidade** (validação de shape apenas): o shape atual da Evolution Node JÁ é o v1. `processEvolutionEvent(payload)` (`apps/api/src/webhook/webhook.service.ts:41`) não muda — o normalizer devolve o mesmo shape.
- **GO → v1 é mapeamento** documentado em §4.7 (whatsmeow). ⚠️ **O payload real da GO NÃO está capturado** (naming AMQP/campos são validados na Fase 0 🔒 com número de teste). Portanto as fixtures GO deste plano derivam do shape DOCUMENTADO e são marcadas `@provisional` — o normalizer é construído da tabela de/para; só o realismo das fixtures GO fica pendente de captura real antes de produção. Não bloqueia entregar/testar o código agora.
- **Não colidir com o `NexusEvent` interno** (`packages/shared/src/types/nexus-event.ts`) — esse é o evento de REALTIME do painel (`message.received`, `ai.toggled`…), coisa diferente. O contrato do gateway é `NexusEventV1`.
- **Descartes são explícitos e logados, não erro** (§4.7): eventos GO fora do contrato v1 (`Receipt(ReadSelf)`, `QRCode`, calls, labels, newsletter, `HistorySync`) → `normalizeGatewayEvent` devolve `null` (o chamador loga `evt.normalizer-drop` e segue; NÃO é NACK).
- Função **pura** (sem I/O, sem Redis, sem Nest). O `ctx` (resolução `instanceId→instancia` e `ownerJid`) é injetado pelo chamador — o normalizer não consulta nada.
- **DRY:** a mesma função roda no consumer do painel e é espelhada no nó de entrada do engine (mesmos fixtures). Uma única fonte de verdade.

**Nota de commit:** `packages/**` e `apps/**` NÃO estão no `.gitignore` (só `docs/`). `git add` normal para código; `git add -f` só para este plano sob `docs/`. Identidade `rafabrh`, sem trailers do Claude.

**Gotcha do monorepo:** `apps/api` consome `@nexus/shared` do `dist` (não há alias p/ `src`). Após mudar `packages/shared/src`, **rodar `npm run build --prefix packages/shared`** antes do typecheck/testes do `apps/api`. Os testes do próprio `packages/shared` rodam contra `src` (Vitest) — não precisam do build.

---

## File Structure

- **Create** `packages/shared/src/types/nexus-event-v1.ts` — tipos do contrato `NexusEventV1` (união discriminada por `event`) + `RawGatewayEvent` (input cru) + `NormalizeContext`.
- **Create** `packages/shared/src/gateway/normalize-gateway-event.ts` — `normalizeGatewayEvent(raw, ctx)` + helpers privados de mapeamento GO.
- **Create** `packages/shared/src/gateway/normalize-gateway-event.spec.ts` — tabela dourada (fixtures Node reais + GO `@provisional`).
- **Create** `packages/shared/src/gateway/fixtures/` — `node.fixtures.ts` e `go.fixtures.ts` (payloads crus + esperado v1).
- **Modify** `packages/shared/src/index.ts` — exportar o contrato + normalizer (barrel).
- **Modify** `packages/shared/src/constants/redis-keys.ts` — adicionar `evtDedup` e `evtCount` (chaves de boundary do consumer, derivadas do v1).

---

## Task 1: Tipos do contrato `NexusEventV1`

**Files:** Create `packages/shared/src/types/nexus-event-v1.ts`.

O shape v1 é o que a Evolution Node já entrega (ver `webhook.service.ts:41-78`): `{ event, instance, data: { key: { remoteJid, remoteJidAlt?, fromMe, id, participant? }, pushName?, message?, messageTimestamp? }, sender? }`.

- [ ] **Step 1: Escrever os tipos**

```ts
// Contrato interno de eventos de gateway (D12). NÃO confundir com o NexusEvent
// interno de realtime (types/nexus-event.ts). Este é o shape que a Evolution Node
// já entrega e que o painel/fluxo já consomem — promovido a contrato versionado.
// A Evolution GO (whatsmeow) é normalizada PARA este shape na borda.

/** Tipos de evento do contrato v1 que os consumidores conhecem. */
export type NexusEventV1Type =
  | 'messages.upsert'   // mensagem recebida ou eco do próprio envio
  | 'send.message'      // envio feito pela própria IA/painel
  | 'messages.update'   // ACK de entrega/leitura
  | 'connection.update' // conexão do gateway (open/close)
  | 'contacts.update'   // nome/foto de contato
  | 'presence.update';  // digitando/online (efêmero)

/** Chave da mensagem no contrato v1 (espelha o `data.key` da Evolution). */
export interface NexusEventV1Key {
  /** JID canônico do chat (pode conter @lid, @g.us, @s.whatsapp.net). */
  remoteJid: string;
  /** Telefone real quando o remoteJid é @lid (LID addressing). Opcional. */
  remoteJidAlt?: string;
  /** Remetente dentro de um grupo (só em @g.us). Opcional. */
  participant?: string;
  fromMe: boolean;
  /** WAMID da mensagem. */
  id: string;
}

/** Corpo do evento v1. Campos opcionais conforme o tipo. */
export interface NexusEventV1Data {
  key: NexusEventV1Key;
  pushName?: string;
  /** Conteúdo cru da mensagem (opaco a este contrato; o consumer parseia). */
  message?: Record<string, unknown>;
  /** Epoch em segundos (Evolution) — number ou string numérica. */
  messageTimestamp?: number | string;
  /** Status do ACK em messages.update (ex.: 'DELIVERY_ACK', 'READ'). */
  status?: string;
  [k: string]: unknown;
}

/** O contrato NEXUS Event v1. */
export interface NexusEventV1 {
  event: NexusEventV1Type;
  /** Chave canônica da instância (nome do painel/registry — NUNCA o UUID da GO). */
  instance: string;
  data: NexusEventV1Data;
  /** JID do dono da instância. Node envia; para GO o normalizer injeta via ctx. */
  sender?: string;
  /** Gateway de origem, anexado pelo normalizer para observabilidade. */
  gateway: 'node' | 'go';
}

/** Evento cru vindo de um gateway, antes da normalização. */
export interface RawGatewayEvent {
  [k: string]: unknown;
}

/** Contexto injetado pelo chamador (o normalizer é puro; não consulta nada). */
export interface NormalizeContext {
  /** Gateway de origem do payload cru. */
  gateway: 'node' | 'go';
  /**
   * Resolve o identificador de instância do gateway para a chave canônica.
   * Node: o payload já traz `instance` (nome) → ctx pode ser identidade.
   * GO: o payload traz `instanceId` (UUID) → ctx mapeia UUID → nome canônico.
   */
  resolveInstance: (raw: RawGatewayEvent) => string | null;
  /**
   * JID do dono da instância (config 4.6). A GO não traz `sender`; o normalizer
   * injeta este valor para manter o contrato v1 íntegro (gate de self-chat).
   * Node: pode devolver undefined (o `sender` já vem no payload).
   */
  ownerJid?: (instancia: string) => string | undefined;
}
```

- [ ] **Step 2: Typecheck do pacote shared**

Run: `npm run build --prefix packages/shared`
Expected: build limpo (novo arquivo compila; ainda não exportado no barrel).

- [ ] **Step 3: Commit**

```
git add packages/shared/src/types/nexus-event-v1.ts
git commit -m "feat(shared): contrato NexusEventV1 (tipos do evento de gateway, D12)"
```

---

## Task 2: Fixtures douradas (Node reais + GO provisórias)

**Files:** Create `packages/shared/src/gateway/fixtures/node.fixtures.ts`, `packages/shared/src/gateway/fixtures/go.fixtures.ts`.

Cada fixture = `{ name, raw, ctx, expected }` onde `expected` é o `NexusEventV1` (ou `null` para descarte). Node vem de payloads REAIS (o shape que `processEvolutionEvent` consome hoje). GO vem do shape DOCUMENTADO na spec §4.2/§4.7 e é marcado `@provisional`.

- [ ] **Step 1: Node fixtures (identidade)**

```ts
import type { NexusEventV1, RawGatewayEvent, NormalizeContext } from '../../types/nexus-event-v1';

export interface Fixture {
  name: string;
  raw: RawGatewayEvent;
  ctx: NormalizeContext;
  expected: NexusEventV1 | null;
}

const nodeCtx: NormalizeContext = {
  gateway: 'node',
  resolveInstance: (raw) => (raw.instance as string) ?? null,
};

export const nodeFixtures: Fixture[] = [
  {
    name: 'messages.upsert recebida (fromMe=false)',
    raw: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net',
    },
    ctx: nodeCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'node',
    },
  },
  {
    name: 'messages.upsert @lid (remoteJidAlt = telefone real)',
    raw: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID2' },
        message: { conversation: 'via lid' },
        messageTimestamp: 1700000001,
      },
    },
    ctx: nodeCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID2' },
        message: { conversation: 'via lid' },
        messageTimestamp: 1700000001,
      },
      gateway: 'node',
    },
  },
  {
    name: 'send.message (eco do próprio envio, fromMe=true)',
    raw: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'WAMID3' }, message: { conversation: 'resposta' } },
    },
    ctx: nodeCtx,
    expected: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'WAMID3' }, message: { conversation: 'resposta' } },
      gateway: 'node',
    },
  },
  {
    name: 'instance desconhecida (resolveInstance → null) → drop',
    raw: { event: 'messages.upsert', data: { key: { remoteJid: 'x', fromMe: false, id: 'X' } } },
    ctx: nodeCtx,
    expected: null,
  },
  {
    name: 'payload sem event → drop',
    raw: { instance: 'Shkgroup', data: {} },
    ctx: nodeCtx,
    expected: null,
  },
];
```

- [ ] **Step 2: GO fixtures (@provisional — shape documentado §4.2/§4.7)**

```ts
import type { NexusEventV1, NormalizeContext } from '../../types/nexus-event-v1';
import type { Fixture } from './node.fixtures';

// @provisional: shape derivado da spec §4.2/§4.7 (whatsmeow). Os campos/naming
// REAIS da Evolution GO são capturados na Fase 0 (🔒) com número de teste antes
// de produção. Atualizar estes fixtures com capturas reais quando disponíveis.
const goCtx: NormalizeContext = {
  gateway: 'go',
  // GO traz instanceId (UUID); o ctx resolve para o nome canônico.
  resolveInstance: (raw) => ((raw as any).instanceId === 'uuid-shk' ? 'Shkgroup' : null),
  ownerJid: (inst) => (inst === 'Shkgroup' ? '5511000@s.whatsapp.net' : undefined),
};

export const goFixtures: Fixture[] = [
  {
    name: 'GO Message → messages.upsert (campos Info.* mapeados)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      instanceToken: 'tok',
      data: {
        Info: {
          Chat: '5511999@s.whatsapp.net',
          Sender: '5511999@s.whatsapp.net',
          SenderAlt: '',
          IsFromMe: false,
          IsGroup: false,
          ID: 'GOWAMID1',
          PushName: 'Cliente',
          Timestamp: 1700000000,
        },
        Message: { conversation: 'oi da go' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi da go' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net', // injetado via ctx.ownerJid
      gateway: 'go',
    },
  },
  {
    name: 'GO Message @lid (SenderAlt = telefone real → remoteJidAlt)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      data: {
        Info: {
          Chat: '262246@lid',
          SenderAlt: '5511999@s.whatsapp.net',
          IsFromMe: false,
          IsGroup: false,
          ID: 'GOWAMID2',
          Timestamp: 1700000001,
        },
        Message: { conversation: 'lid go' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID2' },
        message: { conversation: 'lid go' },
        messageTimestamp: 1700000001,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Message em grupo (IsGroup → participant = Sender)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      data: {
        Info: {
          Chat: '123-456@g.us',
          Sender: '5511999@s.whatsapp.net',
          IsFromMe: false,
          IsGroup: true,
          ID: 'GOWAMID3',
          Timestamp: 1700000002,
        },
        Message: { conversation: 'no grupo' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '123-456@g.us', participant: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID3' },
        message: { conversation: 'no grupo' },
        messageTimestamp: 1700000002,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO SendMessage → send.message',
    raw: {
      event: 'SendMessage',
      instanceId: 'uuid-shk',
      data: { Info: { Chat: '5511999@s.whatsapp.net', IsFromMe: true, ID: 'GOWAMID4', Timestamp: 1700000003 }, Message: { conversation: 'resposta go' } },
    },
    ctx: goCtx,
    expected: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'GOWAMID4' }, message: { conversation: 'resposta go' }, messageTimestamp: 1700000003 },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Receipt(Read) → messages.update',
    raw: { event: 'Receipt', instanceId: 'uuid-shk', data: { Type: 'Read', Info: { Chat: '5511999@s.whatsapp.net', ID: 'GOWAMID1', IsFromMe: false } } },
    ctx: goCtx,
    expected: {
      event: 'messages.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID1' }, status: 'READ' },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Connected → connection.update',
    raw: { event: 'Connected', instanceId: 'uuid-shk', data: {} },
    ctx: goCtx,
    expected: { event: 'connection.update', instance: 'Shkgroup', data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'open' }, sender: '5511000@s.whatsapp.net', gateway: 'go' },
  },
  // ---- Descartes explícitos (null) ----
  { name: 'GO Receipt(ReadSelf) → drop', raw: { event: 'Receipt', instanceId: 'uuid-shk', data: { Type: 'ReadSelf' } }, ctx: goCtx, expected: null },
  { name: 'GO QRCode → drop', raw: { event: 'QRCode', instanceId: 'uuid-shk', data: {} }, ctx: goCtx, expected: null },
  { name: 'GO HistorySync → drop', raw: { event: 'HistorySync', instanceId: 'uuid-shk', data: {} }, ctx: goCtx, expected: null },
  { name: 'GO instância desconhecida → drop', raw: { event: 'Message', instanceId: 'uuid-desconhecido', data: {} }, ctx: goCtx, expected: null },
];
```

- [ ] **Step 3: Commit**

```
git add packages/shared/src/gateway/fixtures/
git commit -m "test(shared): fixtures douradas do normalizer (Node reais + GO provisórias)"
```

---

## Task 3: `normalizeGatewayEvent` — Node identity + validação de shape

**Files:** Create `packages/shared/src/gateway/normalize-gateway-event.ts`; Create `packages/shared/src/gateway/normalize-gateway-event.spec.ts` (só os casos Node nesta task).

- [ ] **Step 1: Teste dourado dos casos Node (deve falhar)**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeGatewayEvent } from './normalize-gateway-event';
import { nodeFixtures } from './fixtures/node.fixtures';

describe('normalizeGatewayEvent — Node (identidade)', () => {
  for (const f of nodeFixtures) {
    it(f.name, () => {
      expect(normalizeGatewayEvent(f.raw, f.ctx)).toEqual(f.expected);
    });
  }
});
```

- [ ] **Step 2: Rodar (deve falhar)** — `npm test --prefix packages/shared -- normalize-gateway-event` → FAIL (função não existe).

- [ ] **Step 3: Implementar o caminho Node**

```ts
import type { NexusEventV1, NexusEventV1Type, RawGatewayEvent, NormalizeContext } from '../types/nexus-event-v1';

const V1_TYPES = new Set<NexusEventV1Type>([
  'messages.upsert', 'send.message', 'messages.update', 'connection.update', 'contacts.update', 'presence.update',
]);

export function normalizeGatewayEvent(raw: RawGatewayEvent, ctx: NormalizeContext): NexusEventV1 | null {
  const instance = ctx.resolveInstance(raw);
  if (!instance) return null; // instância desconhecida → drop (logado pelo chamador)

  if (ctx.gateway === 'node') return normalizeNode(raw, instance);
  return normalizeGo(raw, instance, ctx); // Task 4
}

function normalizeNode(raw: RawGatewayEvent, instance: string): NexusEventV1 | null {
  const event = raw.event as string | undefined;
  if (!event || !V1_TYPES.has(event as NexusEventV1Type)) return null; // fora do contrato → drop
  const data = raw.data as NexusEventV1['data'] | undefined;
  if (!data || typeof data !== 'object' || !('key' in data)) return null; // shape inválido → drop
  const out: NexusEventV1 = { event: event as NexusEventV1Type, instance, data, gateway: 'node' };
  if (typeof raw.sender === 'string') out.sender = raw.sender;
  return out;
}
```

Deixe `normalizeGo` como stub `return null;` por enquanto (Task 4 implementa).

- [ ] **Step 4: Rodar (deve passar os casos Node)** — `npm test --prefix packages/shared -- normalize-gateway-event` → PASS (Node).

- [ ] **Step 5: Commit**

```
git add packages/shared/src/gateway/normalize-gateway-event.ts packages/shared/src/gateway/normalize-gateway-event.spec.ts
git commit -m "feat(shared): normalizeGatewayEvent — caminho Node (identidade + validação de shape)"
```

---

## Task 4: `normalizeGatewayEvent` — mapeamento GO→v1

**Files:** Modify `packages/shared/src/gateway/normalize-gateway-event.ts`; Modify `.spec.ts` (adicionar bloco GO).

Mapeamento (§4.7): `Message→messages.upsert`, `SendMessage→send.message`, `Receipt(Delivered|Read)→messages.update`, `Connected/LoggedOut→connection.update`, `Contact/PushName→contacts.update`, `Presence/ChatPresence→presence.update`. Campos: `Info.Chat→key.remoteJid`, `Info.SenderAlt→key.remoteJidAlt` (só quando não vazio), `Info.IsFromMe→key.fromMe`, `Info.ID→key.id`, `Info.PushName→pushName`, `Info.Timestamp→messageTimestamp`, `Info.Sender→key.participant` quando `Info.IsGroup`. `ctx.resolveInstance` já deu `instance`; `ctx.ownerJid(instance)` injeta `sender`. Descartes (`ReadSelf`, `QRCode`, `HistorySync`, calls, labels, newsletter) → `null`.

- [ ] **Step 1: Adicionar o bloco de teste GO (deve falhar)**

```ts
import { goFixtures } from './fixtures/go.fixtures';

describe('normalizeGatewayEvent — GO (mapeamento whatsmeow→v1) [@provisional]', () => {
  for (const f of goFixtures) {
    it(f.name, () => {
      expect(normalizeGatewayEvent(f.raw, f.ctx)).toEqual(f.expected);
    });
  }
});
```

- [ ] **Step 2: Rodar (deve falhar)** — GO cases FAIL (stub devolve null).

- [ ] **Step 3: Implementar `normalizeGo`**

```ts
const GO_EVENT_MAP: Record<string, NexusEventV1Type | undefined> = {
  Message: 'messages.upsert',
  SendMessage: 'send.message',
  Connected: 'connection.update',
  LoggedOut: 'connection.update',
  Contact: 'contacts.update',
  PushName: 'contacts.update',
  Presence: 'presence.update',
  ChatPresence: 'presence.update',
  // Receipt é resolvido à parte (depende de data.Type)
};

// Descartes explícitos (fora do contrato v1 por design).
const GO_DROP = new Set(['QRCode', 'HistorySync', 'CallOffer', 'CallTerminate', 'Labels', 'Newsletter']);

function normalizeGo(raw: RawGatewayEvent, instance: string, ctx: NormalizeContext): NexusEventV1 | null {
  const goEvent = raw.event as string | undefined;
  if (!goEvent || GO_DROP.has(goEvent)) return null;

  const data = (raw.data ?? {}) as Record<string, unknown>;
  const info = (data.Info ?? {}) as Record<string, unknown>;

  let event: NexusEventV1Type | undefined;
  let status: string | undefined;
  if (goEvent === 'Receipt') {
    const type = data.Type as string | undefined;
    if (type === 'Delivered') { event = 'messages.update'; status = 'DELIVERY_ACK'; }
    else if (type === 'Read') { event = 'messages.update'; status = 'READ'; }
    else return null; // ReadSelf e outros → drop
  } else {
    event = GO_EVENT_MAP[goEvent];
  }
  if (!event) return null; // evento GO não mapeado → drop

  const chat = (info.Chat as string) ?? '';
  const isGroup = info.IsGroup === true;
  const senderAlt = info.SenderAlt as string | undefined;

  const key: NexusEventV1['data']['key'] = {
    remoteJid: chat,
    fromMe: info.IsFromMe === true,
    id: (info.ID as string) ?? '',
  };
  if (senderAlt) key.remoteJidAlt = senderAlt;
  if (isGroup && typeof info.Sender === 'string') key.participant = info.Sender;

  const outData: NexusEventV1['data'] = { key };
  if (typeof info.PushName === 'string') outData.pushName = info.PushName;
  if (data.Message !== undefined) outData.message = data.Message as Record<string, unknown>;
  if (info.Timestamp !== undefined) outData.messageTimestamp = info.Timestamp as number;
  if (status) outData.status = status;
  if (goEvent === 'Connected') outData.status = 'open';
  if (goEvent === 'LoggedOut') outData.status = 'close';

  const out: NexusEventV1 = { event, instance, data: outData, gateway: 'go' };
  const owner = ctx.ownerJid?.(instance);
  if (owner) out.sender = owner;
  return out;
}
```

- [ ] **Step 4: Rodar (deve passar Node + GO)** — `npm test --prefix packages/shared -- normalize-gateway-event` → PASS (todos).

- [ ] **Step 5: Commit**

```
git add packages/shared/src/gateway/normalize-gateway-event.ts packages/shared/src/gateway/normalize-gateway-event.spec.ts
git commit -m "feat(shared): normalizeGatewayEvent — mapeamento GO→v1 (whatsmeow, @lid, grupos, descartes)"
```

---

## Task 5: Chaves de boundary no `RedisKeys` (dedup + count)

**Files:** Modify `packages/shared/src/constants/redis-keys.ts` (+ o spec existente `redis-keys.spec.ts`).

O consumer (plano separado) chaveia dedup e contadores pelo evento v1 (§4.4/§8). Adicionar os helpers agora (parte do contrato de boundary), com teste.

- [ ] **Step 1: Teste (deve falhar)** — em `packages/shared/src/constants/redis-keys.spec.ts`:

```ts
it('evtDedup chaveia por instancia:event:msgId', () =>
  expect(RedisKeys.evtDedup('shk', 'messages.upsert', 'WAMID1')).toBe('evt:dedup:shk:messages.upsert:WAMID1'));
it('evtCount chaveia por fonte:instancia:event', () =>
  expect(RedisKeys.evtCount('go', 'shk', 'messages.upsert')).toBe('evt:count:go:shk:messages.upsert'));
```

- [ ] **Step 2: Rodar (deve falhar)** — `npm test --prefix packages/shared -- redis-keys` → FAIL.

- [ ] **Step 3: Implementar** (adicionar ao objeto `RedisKeys`):

```ts
  // Dedup de boundary do consumer (SET NX, TTL 48h — ver spec §4.4). Chaveado
  // pelo evento v1 NORMALIZADO, independente do gateway de origem.
  evtDedup: (inst: string, event: string, msgId: string) =>
    `evt:dedup:${inst}:${event}:${msgId}`,

  // Contador de eventos por fonte (Fase 1, TTL 7d — observabilidade §8).
  evtCount: (fonte: string, inst: string, event: string) =>
    `evt:count:${fonte}:${inst}:${event}`,
```

- [ ] **Step 4: Rodar (deve passar)** — `npm test --prefix packages/shared -- redis-keys` → PASS.

- [ ] **Step 5: Commit**

```
git add packages/shared/src/constants/redis-keys.ts packages/shared/src/constants/redis-keys.spec.ts
git commit -m "feat(shared): RedisKeys.evtDedup + evtCount (boundary do consumer, chaveado por v1)"
```

---

## Task 6: Barrel export + build + suite verde

**Files:** Modify `packages/shared/src/index.ts`.

- [ ] **Step 1: Exportar o contrato + normalizer** — adicionar ao `index.ts`:

```ts
export * from './types/nexus-event-v1';
export { normalizeGatewayEvent } from './gateway/normalize-gateway-event';
```

(NÃO exportar as fixtures — são artefatos de teste.)

- [ ] **Step 2: Build do shared** — Run: `npm run build --prefix packages/shared` → limpo. Confirma que `dist` expõe `NexusEventV1`/`normalizeGatewayEvent` para o `apps/api` (consumer futuro).

- [ ] **Step 3: Suite do shared verde** — Run: `npm test --prefix packages/shared` → PASS (normalizer dourado + redis-keys + pré-existentes).

- [ ] **Step 4: Typecheck do apps/api não regride** — Run: `npm run lint --prefix apps/api` → PASS (o novo export não quebra nada; ainda não é consumido).

- [ ] **Step 5: Commit**

```
git add packages/shared/src/index.ts
git commit -m "feat(shared): exporta NexusEventV1 + normalizeGatewayEvent no barrel"
```

---

## Portões manuais (🔒) e próximos planos

**Fora deste plano (dependem de infra/captura — não são código TDD-ável agora):**
- 🔒 **Fase 0:** subir RabbitMQ (EasyPanel `siteshkgroup`) + Evolution GO (Postgres/MinIO/licença) + parear número de TESTE + fila de inspeção → **capturar o payload REAL da GO** e o naming AMQP. Ao capturar, **substituir os fixtures GO `@provisional`** por reais e re-rodar a tabela dourada (pode exigir ajuste fino no `normalizeGo`).
- **Plano seguinte (Etapa 2 cont.):** módulo `apps/api/src/queue/` — `EvolutionQueueConsumer` (`@golevelup/nestjs-rabbitmq`) → `normalizeGatewayEvent` → dedup (`evtDedup`, SET NX TTL 48h, política por tipo §4.4) → `WebhookService.processEvolutionEvent` + kill-switch `QUEUE_CONSUMER_ENABLED`. Consome ESTE contrato.
- **Plano:** config store (`tenant_engine_config` + write-through Redis) + migrations `gateway`/`transport` no registry.
- **Plano:** `EvolutionClient` port + 2 adapters (node/go).
- 🔒 Engine N8N GO-native (`docs/n8n-engine-v1.json`) — espelha ESTE normalizer no nó de entrada.
