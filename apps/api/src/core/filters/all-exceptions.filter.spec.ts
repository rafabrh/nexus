import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

// Guards/filters globais rodam também no consumer RabbitMQ (golevelup). Num
// contexto AMQP não há reply HTTP — o filter TEM que re-lançar para o
// errorHandler do transporte tratar retry/DLQ com o erro REAL, em vez de
// tentar `reply.status()` num reply inexistente e mascarar a causa.
describe('AllExceptionsFilter — contexto não-HTTP (consumer AMQP)', () => {
  it('re-lança a exceção ORIGINAL em contexto não-HTTP', () => {
    const filter = new AllExceptionsFilter();
    const boom = new Error('processEvolutionEvent falhou');
    const host = {
      getType: () => 'rmq',
      // não deve ser tocado no caminho não-HTTP:
      switchToHttp: () => {
        throw new Error('switchToHttp não deveria ser chamado em AMQP');
      },
    } as unknown as ArgumentsHost;

    expect(() => filter.catch(boom, host)).toThrow(boom);
  });

  it('não engole o erro (senão a mensagem falha seria ACKada e perdida)', () => {
    const filter = new AllExceptionsFilter();
    const host = { getType: () => 'rmq', switchToHttp: vi.fn() } as unknown as ArgumentsHost;
    expect(() => filter.catch(new Error('x'), host)).toThrow();
  });
});
