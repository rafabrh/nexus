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
});
