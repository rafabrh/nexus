import { describe, it, expect } from 'vitest';
import { RedisKeys } from './redis-keys';

describe('RedisKeys.conversationIndex', () => {
  it('namespaces the index per instance', () => {
    expect(RedisKeys.conversationIndex('shk')).toBe('conversas:shk');
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
