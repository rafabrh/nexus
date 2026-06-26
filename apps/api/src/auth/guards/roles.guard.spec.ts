import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

/** ExecutionContext whose request carries the given (or no) authenticated user. */
function context(user: { role?: string } | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** Reflector stub returning the roles a route declares via @Roles(...). */
function reflectorWith(roles: string[] | undefined): Reflector {
  return { getAllAndOverride: vi.fn(() => roles) } as unknown as Reflector;
}

describe('RolesGuard — base authorization', () => {
  it('allows access when the route declares no roles', () => {
    const guard = new RolesGuard(reflectorWith(undefined));
    expect(guard.canActivate(context({ role: 'operator' }))).toBe(true);
  });

  it('allows a user whose role matches a required role', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));
    expect(guard.canActivate(context({ role: 'admin' }))).toBe(true);
  });

  it('denies a user whose role is not in the required set', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));
    expect(() => guard.canActivate(context({ role: 'operator' }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies when the request carries no role', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));
    expect(() => guard.canActivate(context(undefined))).toThrow(ForbiddenException);
  });
});

describe('RolesGuard — superadmin hierarchy (privilege-escalation fix)', () => {
  it('lets a superadmin through a route that requires admin (superadmin > admin)', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));
    expect(guard.canActivate(context({ role: 'superadmin' }))).toBe(true);
  });

  it('lets a superadmin through a superadmin-only route', () => {
    const guard = new RolesGuard(reflectorWith(['superadmin']));
    expect(guard.canActivate(context({ role: 'superadmin' }))).toBe(true);
  });

  it('blocks a tenant admin from a superadmin-only route (closes the cross-tenant hole)', () => {
    const guard = new RolesGuard(reflectorWith(['superadmin']));
    expect(() => guard.canActivate(context({ role: 'admin' }))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks an operator from a superadmin-only route', () => {
    const guard = new RolesGuard(reflectorWith(['superadmin']));
    expect(() => guard.canActivate(context({ role: 'operator' }))).toThrow(
      ForbiddenException,
    );
  });
});
