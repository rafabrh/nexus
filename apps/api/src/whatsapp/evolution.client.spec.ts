import { describe, it, expect, vi } from 'vitest';
import { EvolutionClient } from './evolution.client';

/**
 * probeState collapses the raw connectionState call into exists/absent/unknown.
 * The distinction is safety-critical: `unknown` (transient) must never be read
 * as `absent`, which would let callers destroy a live instance.
 */
function client() {
  const config = { get: vi.fn((_k: string, d?: string) => d ?? '') };
  return new EvolutionClient(config as never);
}

describe('EvolutionClient.probeState', () => {
  it('maps a live instance to { exists, state }', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockResolvedValue({ instance: { state: 'open' } });
    expect(await c.probeState('x')).toEqual({ status: 'exists', state: 'open' });
  });

  it('falls back to "close" when state is missing', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockResolvedValue({ instance: {} });
    expect(await c.probeState('x')).toEqual({ status: 'exists', state: 'close' });
  });

  it('maps a 404 to absent', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockRejectedValue(
      new Error('Evolution API 404: The "x" instance does not exist'),
    );
    expect(await c.probeState('x')).toEqual({ status: 'absent' });
  });

  it('maps a transient failure to unknown (never absent)', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockRejectedValue(new Error('fetch failed: ETIMEDOUT'));
    expect(await c.probeState('x')).toEqual({ status: 'unknown' });
  });
});

/**
 * sendContact/sendLocation montam o body no shape que a Evolution v2 espera. O
 * ponto sensível do contato é o `wuid`: precisa ser SÓ os dígitos do telefone
 * (a Evolution recusa o vCard se vier com máscara). Estes testes travam o
 * endpoint e o corpo — o risco que sinalizamos ao introduzir os endpoints.
 */
describe('EvolutionClient.sendContact', () => {
  it('posta em /message/sendContact com wuid só de dígitos', async () => {
    const c = client();
    const req = vi.spyOn(c as unknown as { request: () => Promise<unknown> }, 'request').mockResolvedValue({});
    await c.sendContact('inst', '5511@s.whatsapp.net', {
      fullName: 'João Silva',
      phoneNumber: '+55 (11) 99999-9999',
      organization: 'ACME',
      email: 'j@acme.com',
    });
    expect(req).toHaveBeenCalledWith('POST', '/message/sendContact/inst', {
      number: '5511@s.whatsapp.net',
      contact: [
        {
          fullName: 'João Silva',
          wuid: '5511999999999',
          phoneNumber: '+55 (11) 99999-9999',
          organization: 'ACME',
          email: 'j@acme.com',
        },
      ],
    });
  });
});

describe('EvolutionClient.sendLocation', () => {
  it('posta em /message/sendLocation com as coordenadas e rótulos', async () => {
    const c = client();
    const req = vi.spyOn(c as unknown as { request: () => Promise<unknown> }, 'request').mockResolvedValue({});
    await c.sendLocation('inst', '5511@s.whatsapp.net', {
      latitude: -23.5505,
      longitude: -46.6333,
      name: 'Escritório',
      address: 'Av. Paulista, 1000',
    });
    expect(req).toHaveBeenCalledWith('POST', '/message/sendLocation/inst', {
      number: '5511@s.whatsapp.net',
      name: 'Escritório',
      address: 'Av. Paulista, 1000',
      latitude: -23.5505,
      longitude: -46.6333,
    });
  });
});
