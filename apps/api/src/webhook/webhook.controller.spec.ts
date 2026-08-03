import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import type { WebhookService } from './webhook.service';

const API_KEY = 'segredo-super-secreto';

function makeController() {
  const service = {
    processEvolutionEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as WebhookService;
  const config = {
    get: vi.fn((k: string) => (k === 'EVOLUTION_API_KEY' ? API_KEY : undefined)),
  } as unknown as ConfigService;
  const controller = new WebhookController(service, config);
  return { controller, service, config };
}

describe('WebhookController.handleEvolution — normalização do boundary (§4.3)', () => {
  let ctx: ReturnType<typeof makeController>;
  beforeEach(() => {
    ctx = makeController();
  });

  it('evento de mensagem: delega o v1 NORMALIZADO (identidade Node + gateway)', async () => {
    const payload = {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'WAMID-1' } },
      sender: '5599@s.whatsapp.net',
    };
    await ctx.controller.handleEvolution(undefined, API_KEY, payload);
    expect(ctx.service.processEvolutionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'messages.upsert',
        instance: 'Shkgroup',
        gateway: 'node',
      }),
    );
  });

  it('evento fora do contrato v1 (connection.update, sem data.key): passa CRU (fallback, sem regressão)', async () => {
    const payload = {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { state: 'open' },
    };
    await ctx.controller.handleEvolution(undefined, API_KEY, payload);
    // Fallback p/ raw: chamado com o payload original, SEM tag gateway (não normalizou).
    expect(ctx.service.processEvolutionEvent).toHaveBeenCalledWith(payload);
    const arg = (ctx.service.processEvolutionEvent as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg).not.toHaveProperty('gateway');
  });

  it('contacts.upsert (data em array, sem key no topo): passa CRU (service ainda trata)', async () => {
    const payload = {
      event: 'contacts.upsert',
      instance: 'Shkgroup',
      data: [{ remoteJid: '5511@s.whatsapp.net', pushName: 'Cliente' }],
    };
    await ctx.controller.handleEvolution(undefined, API_KEY, payload);
    expect(ctx.service.processEvolutionEvent).toHaveBeenCalledWith(payload);
  });

  it('apikey inválida: rejeita e NÃO processa', async () => {
    await expect(
      ctx.controller.handleEvolution(undefined, 'errada', { event: 'messages.upsert' }),
    ).rejects.toThrow();
    expect(ctx.service.processEvolutionEvent).not.toHaveBeenCalled();
  });
});
