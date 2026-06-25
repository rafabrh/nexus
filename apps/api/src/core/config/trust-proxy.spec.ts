import { describe, it, expect } from 'vitest';
import { resolveTrustProxy } from './trust-proxy';

describe('resolveTrustProxy', () => {
  it('trusts 1 proxy hop in production when unset', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(1);
  });

  it('trusts nothing in development when unset', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(resolveTrustProxy({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('treats empty/whitespace as unset', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '  ' } as NodeJS.ProcessEnv)).toBe(1);
  });

  it('parses boolean strings', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('parses a hop count', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '2' } as NodeJS.ProcessEnv)).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: '0' } as NodeJS.ProcessEnv)).toBe(0);
  });

  it('passes through an IP/CIDR/list verbatim', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '10.0.0.0/8' } as NodeJS.ProcessEnv)).toBe('10.0.0.0/8');
    expect(resolveTrustProxy({ TRUST_PROXY: '127.0.0.1,10.0.0.1' } as NodeJS.ProcessEnv)).toBe(
      '127.0.0.1,10.0.0.1',
    );
  });
});
