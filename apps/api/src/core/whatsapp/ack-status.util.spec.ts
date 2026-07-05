import { describe, it, expect } from 'vitest';
import { mapEvolutionAck, highestAck } from './ack-status.util';

describe('mapEvolutionAck — normaliza o status de ACK da Evolution/Baileys', () => {
  it('mapeia o numérico WAMessageStatus (2..5)', () => {
    expect(mapEvolutionAck(2)).toBe('sent');
    expect(mapEvolutionAck(3)).toBe('delivered');
    expect(mapEvolutionAck(4)).toBe('read');
    expect(mapEvolutionAck(5)).toBe('played');
    expect(mapEvolutionAck(6)).toBe('played'); // >=5 satura em played
  });

  it('mapeia o numérico como string de dígitos ("3")', () => {
    expect(mapEvolutionAck('2')).toBe('sent');
    expect(mapEvolutionAck(' 4 ')).toBe('read');
  });

  it('mapeia o enum textual do Baileys', () => {
    expect(mapEvolutionAck('SERVER_ACK')).toBe('sent');
    expect(mapEvolutionAck('DELIVERY_ACK')).toBe('delivered');
    expect(mapEvolutionAck('READ')).toBe('read');
    expect(mapEvolutionAck('PLAYED')).toBe('played');
  });

  it('é tolerante a caixa/variações que contenham a palavra-chave', () => {
    expect(mapEvolutionAck('delivered')).toBe('delivered');
    expect(mapEvolutionAck('Read')).toBe('read');
  });

  it('retorna null para ausente/desconhecido', () => {
    expect(mapEvolutionAck(null)).toBeNull();
    expect(mapEvolutionAck(undefined)).toBeNull();
    expect(mapEvolutionAck(1)).toBeNull(); // PENDING não vira tique
    expect(mapEvolutionAck('WHATEVER')).toBeNull();
    expect(mapEvolutionAck({})).toBeNull();
  });
});

describe('highestAck — maior avanço de um MessageUpdate fora de ordem', () => {
  it('escolhe o de maior rank, ignorando a ordem', () => {
    // Formato real observado em prod (findMessages.MessageUpdate)
    expect(
      highestAck(['SERVER_ACK', 'DELIVERY_ACK', 'DELIVERY_ACK', 'SERVER_ACK', 'READ']),
    ).toBe('read');
    expect(highestAck(['DELIVERY_ACK', 'DELIVERY_ACK', 'READ', 'SERVER_ACK'])).toBe('read');
    expect(highestAck(['SERVER_ACK', 'DELIVERY_ACK', 'DELIVERY_ACK', 'SERVER_ACK'])).toBe(
      'delivered',
    );
    expect(highestAck(['SERVER_ACK', 'SERVER_ACK'])).toBe('sent');
  });

  it('lida com objetos de status já extraídos (números e strings misturados)', () => {
    expect(highestAck([2, 3, 4])).toBe('read');
    expect(highestAck(['SERVER_ACK', 5])).toBe('played');
  });

  it('null quando vazio ou nada reconhecido', () => {
    expect(highestAck([])).toBeNull();
    expect(highestAck(['?', null, undefined, 1])).toBeNull();
  });
});
