import { describe, it, expect, afterEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { MetricsAuthGuard } from './metrics-auth.guard';

function ctx(authHeader?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: authHeader ? { authorization: authHeader } : {} }),
    }),
  } as never;
}
const guardWith = (token?: string) =>
  new MetricsAuthGuard({ get: () => token } as never);

describe('MetricsAuthGuard', () => {
  const prevEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = prevEnv; });

  it('allows with the correct bearer token', () => {
    expect(guardWith('secret-token').canActivate(ctx('Bearer secret-token'))).toBe(true);
  });

  it('REJECTS a wrong token', () => {
    expect(() => guardWith('secret-token').canActivate(ctx('Bearer wrong'))).toThrow(UnauthorizedException);
  });

  it('REJECTS a missing token when one is configured', () => {
    expect(() => guardWith('secret-token').canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('allows when unconfigured outside production (dev tooling)', () => {
    process.env.NODE_ENV = 'development';
    expect(guardWith(undefined).canActivate(ctx())).toBe(true);
  });

  it('DENIES when unconfigured in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => guardWith(undefined).canActivate(ctx())).toThrow(UnauthorizedException);
  });
});
