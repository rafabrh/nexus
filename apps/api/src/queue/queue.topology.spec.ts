import { describe, it, expect } from 'vitest';
import {
  GO_EVENT_QUEUES,
  DLQ_QUEUE,
  DELIVERY_COUNT_HEADER,
  DEFAULT_DELIVERY_LIMIT,
  resolveDeliveryLimit,
} from './queue.topology';

// Caminho A (Fase 0): a Evolution GO 0.7.2 publica no EXCHANGE DEFAULT, direto em
// filas POR EVENTO (quorum, sem DLX). Estes testes travam os nomes reais das filas
// e o cap de retry app-side (via x-delivery-count) que substitui o DLX nativo.

describe('queue.topology — filas reais da Evolution GO (default exchange)', () => {
  it('GO_EVENT_QUEUES = os nomes minúsculos que a GO cria (AMQP_SPECIFIC_EVENTS)', () => {
    expect(GO_EVENT_QUEUES).toEqual([
      'message',
      'receipt',
      'presence',
      'connected',
      'loggedout',
      'contact',
      'pushname',
    ]);
  });

  it('DLQ_QUEUE reaproveita a fila já existente no broker', () => {
    expect(DLQ_QUEUE).toBe('nexus.panel.events.dlq');
  });

  it('DELIVERY_COUNT_HEADER é o header nativo da quorum queue', () => {
    expect(DELIVERY_COUNT_HEADER).toBe('x-delivery-count');
  });

  it('default do cap de entregas', () => {
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

  it('0 → default (nunca 0 entregas; senão descartaria de imediato)', () => {
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

  it('Infinity → default (isFinite barra; senão nunca dead-letter)', () => {
    expect(resolveDeliveryLimit({ QUEUE_DELIVERY_LIMIT: 'Infinity' })).toBe(DEFAULT_DELIVERY_LIMIT);
  });

  it('fracionário → floor (contagem de entregas é inteira)', () => {
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
