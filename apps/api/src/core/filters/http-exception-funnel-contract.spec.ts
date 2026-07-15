import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * REGRESSION PIN (funil dinâmico 409 contract) — CORRIGIDO.
 *
 * The funil dinâmico DELETE contract (spec Seção 4.5 + D4) says a 409 body carries
 * BOTH a ready-to-toast `message` AND the `count` of conversations still on the
 * column. The web `ApiError` (apps/web/src/lib/api.ts) reads `body.message` verbatim
 * into `err.message`, and the Kanban shows `notify.error(err.message)` while reading
 * `err.status === 409`.
 *
 * FunnelStagesService.remove throws `new ConflictException({ message, count })`. O
 * HttpExceptionFilter global formata em RFC 7807, mas agora TAMBÉM espelha `message`
 * (←`detail`) e ESPALHA os campos extras do payload (`count`). Assim o corpo na rede
 * carrega `{ type, title, status, detail, message, count, instance, timestamp }` —
 * `detail` para consumidores RFC 7807 e `message`+`count` para o contrato do Kanban.
 *
 * Este teste PINA o shape corrigido para pegar qualquer regressão futura do filtro.
 */

function captureReply() {
  const sent: { status?: number; body?: any; contentType?: string } = {};
  const reply: any = {
    status: vi.fn((s: number) => {
      sent.status = s;
      return reply;
    }),
    header: vi.fn((k: string, v: string) => {
      if (k.toLowerCase() === 'content-type') sent.contentType = v;
      return reply;
    }),
    send: vi.fn((b: any) => {
      sent.body = b;
      return reply;
    }),
  };
  return { reply, sent };
}

function hostFor(reply: any) {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ url: '/api/v1/funnel/stages/id4', method: 'DELETE' }),
    }),
  } as any;
}

describe('409 funnel DELETE contract through the global HttpExceptionFilter', () => {
  const exc = () =>
    new ConflictException({
      message: 'Existem 3 conversa(s) nesta coluna. Mova-as antes de excluir.',
      count: 3,
    });

  it('keeps the 409 status', () => {
    const { reply, sent } = captureReply();
    new HttpExceptionFilter().catch(exc(), hostFor(reply));
    expect(sent.status).toBe(409);
  });

  it('carries the toast `message` AND the `count` on the wire (D4 contract)', () => {
    const { reply, sent } = captureReply();
    new HttpExceptionFilter().catch(exc(), hostFor(reply));

    const toast = 'Existem 3 conversa(s) nesta coluna. Mova-as antes de excluir.';
    // `detail` permanece para consumidores RFC 7807.
    expect(sent.body.detail).toBe(toast);
    // `message` espelha o texto pronto → o ApiError do web usa isto no toast.
    expect(sent.body.message).toBe(toast);
    // `count` sobrevive → o Kanban sabe quantos cards mover.
    expect(sent.body.count).toBe(3);
    // Content-type RFC 7807 preservado.
    expect(sent.contentType).toBe('application/problem+json');
  });
});
