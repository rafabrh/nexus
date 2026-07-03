import { describe, it, expect, vi } from 'vitest';
import { isAiOff } from './ai-off.util';

/** Mock de redis por sufixo: `:rawjid` (mapa canônico->cru @lid) e o controle. */
function makeRedis(control: string | null, rawJid: string | null = null) {
  return {
    get: vi.fn(async (key: string) => {
      if (key.endsWith(':rawjid')) return rawJid;
      if (key.endsWith(':humanControlUntil')) return control;
      return null;
    }),
  } as any;
}

describe('isAiOff — semântica de "IA desligada" do BFF-gate', () => {
  it('true quando humanControlUntil está no futuro (OFF permanente)', async () => {
    const redis = makeRedis('4102444800000');
    expect(await isAiOff(redis, 'shk', '5511@s.whatsapp.net')).toBe(true);
  });

  it('true para uma pausa temporizada ainda válida', async () => {
    const redis = makeRedis(String(Date.now() + 60 * 60 * 1000));
    expect(await isAiOff(redis, 'shk', '5511@s.whatsapp.net')).toBe(true);
  });

  it('false quando não há chave (IA ligada)', async () => {
    const redis = makeRedis(null);
    expect(await isAiOff(redis, 'shk', '5511@s.whatsapp.net')).toBe(false);
  });

  it('false quando a pausa já expirou', async () => {
    const redis = makeRedis(String(Date.now() - 1000));
    expect(await isAiOff(redis, 'shk', '5511@s.whatsapp.net')).toBe(false);
  });

  it('checa também a chave cru @lid (dual-write do painel)', async () => {
    // Canônica sem valor, mas a cru @lid está OFF permanente → ainda é off.
    const redis = {
      get: vi.fn(async (key: string) => {
        if (key.endsWith(':rawjid')) return '99999@lid';
        if (key === 'chat:shk:99999@lid:humanControlUntil') return '4102444800000';
        return null;
      }),
    } as any;
    expect(await isAiOff(redis, 'shk', '5511@s.whatsapp.net')).toBe(true);
  });
});
