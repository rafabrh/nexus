import { describe, it, expect } from 'vitest';
import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// Filter global @Catch(HttpException). Guards/filters globais rodam também no
// consumer RabbitMQ (golevelup). Sem reply HTTP, o filter TEM que re-lançar para
// o errorHandler do transporte tratar retry/DLQ — senão `reply.status()` num
// reply inexistente mascara a causa e engole a falha (mensagem ACKada e perdida).
describe('HttpExceptionFilter — contexto não-HTTP (consumer AMQP)', () => {
  it('re-lança a HttpException ORIGINAL em contexto não-HTTP', () => {
    const filter = new HttpExceptionFilter();
    const boom = new NotFoundException('mídia inline não encontrada');
    const host = {
      getType: () => 'rmq',
      switchToHttp: () => {
        throw new Error('switchToHttp não deveria ser chamado em AMQP');
      },
    } as unknown as ArgumentsHost;

    expect(() => filter.catch(boom, host)).toThrow(boom);
  });
});
