import { describe, it, expect } from 'vitest';
import { RedisKeys } from './redis-keys';

describe('RedisKeys.conversationIndex', () => {
  it('namespaces the index per instance', () => {
    expect(RedisKeys.conversationIndex('shk')).toBe('conversas:shk');
  });
});
