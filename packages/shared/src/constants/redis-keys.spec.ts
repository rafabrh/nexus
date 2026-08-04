import { describe, it, expect } from 'vitest';
import { RedisKeys } from './redis-keys';

describe('RedisKeys.conversationIndex', () => {
  it('namespaces the index per instance', () => {
    expect(RedisKeys.conversationIndex('shk')).toBe('conversas:shk');
  });
});

describe('RedisKeys.magicLinkCooldown', () => {
  it('namespaces the resend cooldown per email', () => {
    expect(RedisKeys.magicLinkCooldown('user@x.com')).toBe(
      'magiclink:cooldown:user@x.com',
    );
  });

  it('never collides with a token key (magiclink:<uuid>)', () => {
    const token = '11111111-2222-3333-4444-555555555555';
    expect(RedisKeys.magicLink(token)).not.toBe(
      RedisKeys.magicLinkCooldown('user@x.com'),
    );
  });
});

describe('RedisKeys.n8nForwardDedup', () => {
  it('namespaces the forward dedup key per instance + message id', () => {
    expect(RedisKeys.n8nForwardDedup('shk', 'ABC123')).toBe('n8n:fwd:shk:ABC123');
  });
});

describe('RedisKeys.tenantCfg', () => {
  it('namespaceia a config por instância (write-through §4.6)', () => {
    expect(RedisKeys.tenantCfg('Shkgroup')).toBe('tenant:cfg:Shkgroup');
  });
});

describe('RedisKeys.inlineMedia', () => {
  it('chaveia a mídia inline por instância + mediaId (WAMID)', () => {
    expect(RedisKeys.inlineMedia('shk', 'WAMID1')).toBe('media:shk:WAMID1');
  });

  it('isola a mesma mídia entre tenants', () => {
    expect(RedisKeys.inlineMedia('a', 'M1')).not.toBe(RedisKeys.inlineMedia('b', 'M1'));
  });

  it('usa o formato literal media:{inst}:{mediaId} (contrato ingestão↔proxy)', () => {
    // A ingestão (webhook.persistInlineMedia) e o proxy (getMedia.readInlineMedia)
    // localizam o blob pela MESMA chave. Trava o formato para que um refactor não
    // divirja os dois lados silenciosamente (mídia sumiria sem erro).
    expect(RedisKeys.inlineMedia('shk', 'WAMID9')).toBe('media:shk:WAMID9');
  });
});

describe('RedisKeys.contact', () => {
  it('namespaces the contact key per instance', () => {
    expect(RedisKeys.contact('shk', '5511999999999')).toBe(
      'contact:shk:5511999999999',
    );
  });

  it('produces distinct keys for the same phone across tenants', () => {
    const phone = '5511999999999';
    const keyA = RedisKeys.contact('tenantA', phone);
    const keyB = RedisKeys.contact('tenantB', phone);

    expect(keyA).toBe('contact:tenantA:5511999999999');
    expect(keyB).toBe('contact:tenantB:5511999999999');
    expect(keyA).not.toBe(keyB);
  });

  it('evtDedup chaveia por instancia:event:msgId', () => {
    expect(RedisKeys.evtDedup('shk', 'messages.upsert', 'WAMID1')).toBe(
      'evt:dedup:shk:messages.upsert:WAMID1',
    );
  });

  it('evtCount chaveia por fonte:instancia:event', () => {
    expect(RedisKeys.evtCount('go', 'shk', 'messages.upsert')).toBe(
      'evt:count:go:shk:messages.upsert',
    );
  });
});
