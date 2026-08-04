import { describe, it, expect } from 'vitest';
import {
  EVOLUTION_EXCHANGE,
  PANEL_EVENTS_QUEUE,
  NEXUS_DLX,
  PANEL_EVENTS_DLQ_ROUTING_KEY,
  DEFAULT_DELIVERY_LIMIT,
  resolveDeliveryLimit,
  panelEventsQueueArguments,
} from './queue.topology';

// GATE #2 (retry vs DLQ): estes testes travam a INTENÇÃO da topologia (a validação
// de reentrega/dead-letter ponta-a-ponta é GATED no broker — passo 8). Se algum
// argumento mudar sem querer (quorum, x-delivery-limit, DLX/routing-key), a fila
// volta ao comportamento do bug (mensagem boa direto na DLQ) e um destes quebra.

describe('queue.topology — nomes de fila/exchange (fonte única)', () => {
  it('constantes de nomes batem com o contrato do consumer', () => {
    expect(EVOLUTION_EXCHANGE).toBe('evolution');
    expect(PANEL_EVENTS_QUEUE).toBe('nexus.panel.events');
    expect(NEXUS_DLX).toBe('nexus.dlx');
    expect(PANEL_EVENTS_DLQ_ROUTING_KEY).toBe('nexus.panel.events.dlq');
    expect(DEFAULT_DELIVERY_LIMIT).toBe(5);
  });
});

describe('resolveDeliveryLimit — env robusto (piso 1, default 5)', () => {
  it('env ausente → default', () => {
    expect(resolveDeliveryLimit({})).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('valor válido → usado', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '10' })).toBe(10);
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '1' })).toBe(1);
  });

  it('0 → default (nunca 0 entregas; senão a fila descartaria de imediato)', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '0' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('negativo → default', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '-3' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('NaN / não numérico → default', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: 'abc' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it("string vazia → default (Number('') é 0, cai no piso)", () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('Infinity → default (isFinite barra; senão a fila nunca dead-letter)', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: 'Infinity' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('fracionário → floor (x-delivery-limit é inteiro)', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '3.9' })).toBe(3);
  });

  it('whitespace ao redor → Number() trima e usa', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: '  7  ' })).toBe(7);
  });

  it('nunca retorna abaixo de 1 (piso), qualquer entrada', () => {
    for (const v of ['0', '-100', '', 'abc', 'NaN', '0.4', '-0.9']) {
      expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: v })).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('panelEventsQueueArguments — quorum + delivery-limit + dead-letter', () => {
  it('declara quorum queue (habilita x-delivery-limit nativo)', () => {
    const args = panelEventsQueueArguments({ QUEUE_DELIVERY_LIMIT: '5' });
    expect(args['x-queue-type']).toBe('quorum');
  });

  it('x-delivery-limit reflete resolveDeliveryLimit (retry contado antes do DLQ)', () => {
    expect(panelEventsQueueArguments({ QUEUE_DELIVERY_LIMIT: '9' })['x-delivery-limit']).toBe(9);
    expect(panelEventsQueueArguments({})['x-delivery-limit']).toBe(DEFAULT_DELIVERY_LIMIT);
    // env inválido cai no default — a fila nunca fica sem limite.
    expect(panelEventsQueueArguments({ QUEUE_DELIVERY_LIMIT: '0' })['x-delivery-limit']).toBe(
      DEFAULT_DELIVERY_LIMIT,
    );
  });

  it('dead-letter aponta para o DLX e a routing-key da DLQ', () => {
    const args = panelEventsQueueArguments({});
    expect(args['x-dead-letter-exchange']).toBe(NEXUS_DLX);
    expect(args['x-dead-letter-routing-key']).toBe(PANEL_EVENTS_DLQ_ROUTING_KEY);
  });

  it('shape exato dos argumentos (trava regressão silenciosa da topologia)', () => {
    expect(panelEventsQueueArguments({ QUEUE_DELIVERY_LIMIT: '5' })).toEqual({
      'x-queue-type': 'quorum',
      'x-delivery-limit': 5,
      'x-dead-letter-exchange': 'nexus.dlx',
      'x-dead-letter-routing-key': 'nexus.panel.events.dlq',
    });
  });
});
