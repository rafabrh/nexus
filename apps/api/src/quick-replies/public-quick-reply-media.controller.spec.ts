import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublicQuickReplyMediaController } from './public-quick-reply-media.controller';
import { signMedia } from '../media/media-signature.util';
import type { FastifyReply } from 'fastify';

const SECRET = 'test-secret-1234';

function makeStorage(existsResult = true) {
  const stream = { pipe: vi.fn() } as any;
  return {
    exists: vi.fn().mockResolvedValue(existsResult),
    createReadStream: vi.fn().mockReturnValue(stream),
    put: vi.fn(),
    stat: vi.fn(),
    delete: vi.fn(),
  };
}

function makeConfig(secret = SECRET) {
  return { getOrThrow: vi.fn().mockReturnValue(secret) };
}

function makeReply() {
  const reply = {
    header: vi.fn(),
    send: vi.fn(),
  } as unknown as FastifyReply;
  (reply.header as any).mockReturnValue(reply);
  return reply;
}

describe('PublicQuickReplyMediaController', () => {
  const inst = 'inst-test';
  const mediaId = 'media-abc-123';

  it('assinatura válida + arquivo existe → chama createReadStream e envia', async () => {
    const storage = makeStorage(true);
    const config = makeConfig();
    const controller = new PublicQuickReplyMediaController(storage as any, config as any);
    const reply = makeReply();

    const { exp, sig } = signMedia(inst, mediaId, 300, SECRET);

    await controller.serve(mediaId, inst, String(exp), sig, reply);

    expect(storage.exists).toHaveBeenCalledWith(inst, mediaId);
    expect(storage.createReadStream).toHaveBeenCalledWith(inst, mediaId);
    expect(reply.send).toHaveBeenCalled();
  });

  it('assinatura inválida → ForbiddenException', async () => {
    const storage = makeStorage(true);
    const config = makeConfig();
    const controller = new PublicQuickReplyMediaController(storage as any, config as any);
    const reply = makeReply();

    const { exp } = signMedia(inst, mediaId, 300, SECRET);

    await expect(
      controller.serve(mediaId, inst, String(exp), 'sig-errada', reply),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assinatura expirada → ForbiddenException', async () => {
    const storage = makeStorage(true);
    const config = makeConfig();
    const controller = new PublicQuickReplyMediaController(storage as any, config as any);
    const reply = makeReply();

    const expiredExp = Math.floor(Date.now() / 1000) - 10;
    // compute a valid sig for expired exp so we hit the exp check, not sig check
    const { sig } = signMedia(inst, mediaId, -10, SECRET);

    await expect(
      controller.serve(mediaId, inst, String(expiredExp), sig, reply),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('arquivo inexistente com sig válida → NotFoundException', async () => {
    const storage = makeStorage(false);
    const config = makeConfig();
    const controller = new PublicQuickReplyMediaController(storage as any, config as any);
    const reply = makeReply();

    const { exp, sig } = signMedia(inst, mediaId, 300, SECRET);

    await expect(
      controller.serve(mediaId, inst, String(exp), sig, reply),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
