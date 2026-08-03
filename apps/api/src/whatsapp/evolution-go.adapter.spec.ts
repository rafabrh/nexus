import { describe, expect, it, vi } from 'vitest';
import { EvolutionGoAdapter } from './evolution-go.adapter';

/**
 * Dialeto REST GO capturado na Fase 0. Os testes travam ENDPOINT + BODY + qual
 * apikey (token da instância vs GLOBAL) de cada método, e o degrade seguro de
 * `probeState`/dos fetches sem equivalente GO.
 */
type Creds = { instanceId?: string; token?: string } | undefined;

// `null` = sem creds seedadas (não `undefined`, que dispararia o default do JS).
function adapter(creds: Creds | 'default' | null = 'default') {
  const resolved: Creds =
    creds === 'default' ? { instanceId: 'uuid-1', token: 'INSTTOK' } : creds ?? undefined;
  const config = {
    get: vi.fn((k: string, d?: string) => {
      if (k === 'EVOLUTION_GO_URL') return 'https://evogo.test';
      if (k === 'EVOLUTION_GO_API_KEY') return 'GLOBALKEY';
      return d ?? '';
    }),
  };
  const store = { goCredentials: vi.fn(() => resolved) };
  return new EvolutionGoAdapter(config as never, store as never);
}

function spyRequest(a: EvolutionGoAdapter, resolved: unknown) {
  return vi
    .spyOn(a as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request')
    .mockResolvedValue(resolved);
}

describe('EvolutionGoAdapter — envio (token da instância)', () => {
  it('sendTextMessage → POST /send/text {number,text} com token da instância', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendTextMessage('inst', '5511@s.whatsapp.net', 'oi');
    expect(req).toHaveBeenCalledWith('POST', '/send/text', {
      apikey: 'INSTTOK',
      body: { number: '5511@s.whatsapp.net', text: 'oi' },
    });
  });

  it('sendTextMessage com quoted → body.quoted = { id }', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendTextMessage('inst', 'jid', 'oi', { id: 'WAMID' });
    expect(req).toHaveBeenCalledWith('POST', '/send/text', {
      apikey: 'INSTTOK',
      body: { number: 'jid', text: 'oi', quoted: { id: 'WAMID' } },
    });
  });

  it('sendMedia → POST /send/media com media mapeada p/ url + type', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendMedia('inst', 'jid', {
      mediatype: 'image',
      media: 'http://x/img.jpg',
      caption: 'legenda',
      fileName: 'f.jpg',
    });
    expect(req).toHaveBeenCalledWith('POST', '/send/media', {
      apikey: 'INSTTOK',
      body: { number: 'jid', url: 'http://x/img.jpg', type: 'image', caption: 'legenda', filename: 'f.jpg' },
    });
  });

  it('sendWhatsAppAudio → /send/media type=audio (não há /send/audio)', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendWhatsAppAudio('inst', 'jid', 'BASE64AUDIO');
    expect(req).toHaveBeenCalledWith('POST', '/send/media', {
      apikey: 'INSTTOK',
      body: { number: 'jid', url: 'BASE64AUDIO', type: 'audio' },
    });
  });

  it('sendContact → POST /send/contact { vcard }', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendContact('inst', 'jid', {
      fullName: 'João Silva',
      phoneNumber: '5511999998888',
      organization: 'ACME',
    });
    expect(req).toHaveBeenCalledWith('POST', '/send/contact', {
      apikey: 'INSTTOK',
      body: { number: 'jid', vcard: { fullName: 'João Silva', phoneNumber: '5511999998888', organization: 'ACME' } },
    });
  });

  it('sendLocation → POST /send/location', async () => {
    const a = adapter();
    const req = spyRequest(a, {});
    await a.sendLocation('inst', 'jid', { latitude: -23.5, longitude: -46.6, name: 'Escritório' });
    expect(req).toHaveBeenCalledWith('POST', '/send/location', {
      apikey: 'INSTTOK',
      body: { number: 'jid', latitude: -23.5, longitude: -46.6, name: 'Escritório' },
    });
  });

  it('sem token seedado → envio lança erro claro (Fase 0/seed pendente)', async () => {
    const a = adapter(null);
    await expect(a.sendTextMessage('inst', 'jid', 'oi')).rejects.toThrow(/instanceToken/);
  });
});

describe('EvolutionGoAdapter — admin (GLOBAL key)', () => {
  it('fetchInstances → GET /instance/all e devolve data[]', async () => {
    const a = adapter();
    const req = spyRequest(a, { data: [{ id: 'x' }] });
    expect(await a.fetchInstances()).toEqual([{ id: 'x' }]);
    expect(req).toHaveBeenCalledWith('GET', '/instance/all', { apikey: 'GLOBALKEY' });
  });

  it('healthCheck → GET /server/ok com GLOBAL key', async () => {
    const a = adapter();
    const req = spyRequest(a, { status: 'ok' });
    await a.healthCheck();
    expect(req).toHaveBeenCalledWith('GET', '/server/ok', { apikey: 'GLOBALKEY' });
  });

  it('createInstance → POST /instance/create {name, token gerado} com GLOBAL key', async () => {
    const a = adapter();
    const req = spyRequest(a, { data: { id: 'u', token: 't' } });
    await a.createInstance('novo');
    const [method, path, opts] = (req.mock.calls[0] ?? []) as [string, string, { apikey: string; body: { name: string; token: string } }];
    expect(method).toBe('POST');
    expect(path).toBe('/instance/create');
    expect(opts.apikey).toBe('GLOBALKEY');
    expect(opts.body.name).toBe('novo');
    expect(opts.body.token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('deleteInstance → DELETE /instance/delete/{uuid} com GLOBAL key quando há UUID', async () => {
    const a = adapter({ instanceId: 'uuid-9', token: 'T' });
    const req = spyRequest(a, undefined);
    await a.deleteInstance('inst');
    expect(req).toHaveBeenCalledWith('DELETE', '/instance/delete/uuid-9', { apikey: 'GLOBALKEY' });
  });
});

describe('EvolutionGoAdapter.probeState — degrade seguro (gate 2.4)', () => {
  it('LoggedIn → { exists, open }', async () => {
    const a = adapter();
    spyRequest(a, { data: { Connected: true, LoggedIn: true } });
    expect(await a.probeState('inst')).toEqual({ status: 'exists', state: 'open' });
  });

  it('Connected mas não LoggedIn → { exists, connecting }', async () => {
    const a = adapter();
    spyRequest(a, { data: { Connected: true, LoggedIn: false } });
    expect(await a.probeState('inst')).toEqual({ status: 'exists', state: 'connecting' });
  });

  it('nem Connected → { exists, close }', async () => {
    const a = adapter();
    spyRequest(a, { data: {} });
    expect(await a.probeState('inst')).toEqual({ status: 'exists', state: 'close' });
  });

  it('sem token seedado → unknown (NUNCA lança)', async () => {
    const a = adapter(null);
    expect(await a.probeState('inst')).toEqual({ status: 'unknown' });
  });

  it('404 → absent', async () => {
    const a = adapter();
    vi.spyOn(a as unknown as { request: () => Promise<unknown> }, 'request').mockRejectedValue(
      new Error('Evolution GO 404: not found'),
    );
    expect(await a.probeState('inst')).toEqual({ status: 'absent' });
  });

  it('falha transitória → unknown (nunca absent)', async () => {
    const a = adapter();
    vi.spyOn(a as unknown as { request: () => Promise<unknown> }, 'request').mockRejectedValue(
      new Error('fetch failed: ETIMEDOUT'),
    );
    expect(await a.probeState('inst')).toEqual({ status: 'unknown' });
  });
});

describe('EvolutionGoAdapter — QR + métodos sem equivalente GO (degradam)', () => {
  it('getQrCode extrai o base64 do data-URI', async () => {
    const a = adapter();
    spyRequest(a, { data: { qrcode: 'data:image/png;base64,ABC123' } });
    expect(await a.getQrCode('inst')).toEqual({ base64: 'ABC123', code: 'data:image/png;base64,ABC123' });
  });

  it('findContacts/findChats/findMessages → [] ; fetchProfilePictureUrl → null', async () => {
    const a = adapter();
    expect(await a.findContacts('i')).toEqual([]);
    expect(await a.findChats('i')).toEqual([]);
    expect(await a.findMessages('i', 'j')).toEqual([]);
    expect(await a.fetchProfilePictureUrl('i', 'j')).toBeNull();
  });

  it('getBase64FromMediaMessage lança (GO entrega mídia inline)', async () => {
    const a = adapter();
    await expect(
      a.getBase64FromMediaMessage('i', { id: 'x', remoteJid: 'j', fromMe: false }),
    ).rejects.toThrow(/inline/);
  });
});
