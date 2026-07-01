import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { N8nForwarderService } from './n8n-forwarder.service';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (k: string, v: string, ...a: unknown[]) => {
      if (a.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
  } as any;
}

const URL = 'https://n8n.example/webhook/clientwpp';
const payload = { event: 'messages.upsert', instance: 'shk', data: { key: { id: 'M1' } } };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('N8nForwarderService', () => {
  it('skips (no POST) when the tenant has no n8nWebhookUrl', async () => {
    const svc = new N8nForwarderService(makeRedis());
    await svc.forward('shk', null, 'M1', payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the raw payload to the tenant n8n url on first delivery', async () => {
    const svc = new N8nForwarderService(makeRedis());
    await svc.forward('shk', URL, 'M1', payload);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [calledUrl, opts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect(JSON.parse(opts.body)).toEqual(payload);
  });

  it('dedups by message id: a webhook retry does not POST twice', async () => {
    const redis = makeRedis();
    const svc = new N8nForwarderService(redis);
    await svc.forward('shk', URL, 'M1', payload);
    await svc.forward('shk', URL, 'M1', payload);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('always forwards when there is no message id (dedup skipped)', async () => {
    const svc = new N8nForwarderService(makeRedis());
    await svc.forward('shk', URL, null, payload);
    await svc.forward('shk', URL, null, payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never throws when the N8N call fails (isolated failure)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new N8nForwarderService(makeRedis());
    await expect(svc.forward('shk', URL, 'M1', payload)).resolves.toBeUndefined();
  });
});
