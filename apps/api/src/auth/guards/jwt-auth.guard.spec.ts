import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Minimal ExecutionContext with no auth token on the request. */
function contextWithoutToken(): ExecutionContext {
  const request = { cookies: {}, headers: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** ExecutionContext carrying a bearer token, with a mutable request object so
 *  assertions can inspect what the guard attached (user / instancia). */
function contextWithToken(token: string): {
  ctx: ExecutionContext;
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { ctx, request };
}

const notPublic = {
  getAllAndOverride: vi.fn(() => undefined),
} as unknown as Reflector;

describe('JwtAuthGuard @Public bypass', () => {
  it('returns true without requiring a token when the route is @Public()', async () => {
    const jwt = { verify: vi.fn() } as any;
    const redis = { get: vi.fn() } as any;
    const reflector = {
      getAllAndOverride: vi.fn(() => true),
    } as unknown as Reflector;

    const guard = new JwtAuthGuard(jwt, redis, reflector);

    await expect(guard.canActivate(contextWithoutToken())).resolves.toBe(true);
    // Public routes short-circuit: no token extraction, no JWT verification.
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('rejects a non-public route when the token is missing', async () => {
    const jwt = { verify: vi.fn() } as any;
    const redis = { get: vi.fn() } as any;
    const reflector = {
      getAllAndOverride: vi.fn(() => undefined),
    } as unknown as Reflector;

    const guard = new JwtAuthGuard(jwt, redis, reflector);

    await expect(guard.canActivate(contextWithoutToken())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('JwtAuthGuard token validation', () => {
  it('rejects a refresh token presented as an access token (must never grant API access)', async () => {
    const jwt = {
      verify: vi.fn(async () => ({ type: 'refresh', jti: 'r1', instancia: 'shk' })),
    } as any;
    const redis = { get: vi.fn(async () => null) } as any;

    const guard = new JwtAuthGuard(jwt, redis, notPublic);
    const { ctx } = contextWithToken('refresh.jwt');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    // Blacklist is never consulted because the type gate fails first.
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('rejects a blacklisted (logged-out) access token', async () => {
    const jwt = {
      verify: vi.fn(async () => ({ type: 'access', jti: 'blk', instancia: 'shk' })),
    } as any;
    const redis = { get: vi.fn(async () => '1') } as any; // present in blacklist

    const guard = new JwtAuthGuard(jwt, redis, notPublic);
    const { ctx, request } = contextWithToken('blacklisted.jwt');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('accepts a valid access token and attaches user + tenant to the request', async () => {
    const payload = { type: 'access', jti: 'ok', sub: 'a@b.com', instancia: 'shk' };
    const jwt = { verify: vi.fn(async () => payload) } as any;
    const redis = { get: vi.fn(async () => null) } as any; // not blacklisted

    const guard = new JwtAuthGuard(jwt, redis, notPublic);
    const { ctx, request } = contextWithToken('valid.jwt');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
    expect(request.instancia).toBe('shk');
  });

  it('rejects a structurally invalid token (verify throws) as UnauthorizedException', async () => {
    const jwt = {
      verify: vi.fn(async () => {
        throw new Error('bad signature');
      }),
    } as any;
    const redis = { get: vi.fn() } as any;

    const guard = new JwtAuthGuard(jwt, redis, notPublic);
    const { ctx } = contextWithToken('garbage');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
