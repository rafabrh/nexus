import { describe, it, expect, vi } from 'vitest';
import { AiControlService } from './ai-control.service';

/** Mock de deps no padrão dos outros specs da api. */
function makeSvc(currentValue: string | null) {
  const redis = {
    get: vi.fn(async () => currentValue),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  } as any;
  const publisher = { publish: vi.fn(async () => undefined) } as any;
  const svc = new AiControlService(redis, publisher);
  return { svc, redis, publisher };
}

const KEY = 'chat:shk:5511@s.whatsapp.net:humanControlUntil';

describe('AiControlService espelha o Admin do N8N (humanControlUntil)', () => {
  it('OFF permanente (sem expireAt) grava o mesmo valor/TTL do comando `off`', async () => {
    const { svc, redis } = makeSvc(null);

    const res = await svc.toggle('shk', '5511@s.whatsapp.net', { state: 'OFF' } as any);

    // Mesmo valor (ano ~2100) e TTL de 1 ano que o nó "Admin - OFF" do N8N.
    expect(redis.set).toHaveBeenCalledWith(KEY, '4102444800000', 'EX', 31_536_000);
    expect(res.state).toBe('OFF');
    expect(res.until).toBeNull();
  });

  it('OFF_UNTIL (com expireAt) grava a pausa temporizada', async () => {
    const { svc } = makeSvc(null);
    const expireAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const res = await svc.toggle('shk', '5511@s.whatsapp.net', {
      state: 'OFF_UNTIL',
      expireAt,
    } as any);

    expect(res.state).toBe('OFF_UNTIL');
    expect(res.until).toBe(expireAt);
  });

  it('ON deleta a chave (reativa a IA, = comando `on`)', async () => {
    const { svc, redis } = makeSvc('4102444800000');

    const res = await svc.toggle('shk', '5511@s.whatsapp.net', { state: 'ON' } as any);

    expect(redis.del).toHaveBeenCalledWith(KEY);
    expect(res.state).toBe('ON');
  });

  it('getState lê o valor permanente como OFF (não como pausa)', async () => {
    const { svc } = makeSvc('4102444800000');
    const res = await svc.getState('shk', '5511@s.whatsapp.net');
    expect(res.state).toBe('OFF');
    expect(res.until).toBeNull();
  });

  it('getState lê um valor futuro curto como OFF_UNTIL', async () => {
    const { svc } = makeSvc(String(Date.now() + 60 * 60 * 1000));
    const res = await svc.getState('shk', '5511@s.whatsapp.net');
    expect(res.state).toBe('OFF_UNTIL');
    expect(res.until).not.toBeNull();
  });

  it('getState com valor expirado/ausente = ON', async () => {
    const { svc } = makeSvc(null);
    const res = await svc.getState('shk', '5511@s.whatsapp.net');
    expect(res.state).toBe('ON');
  });
});
