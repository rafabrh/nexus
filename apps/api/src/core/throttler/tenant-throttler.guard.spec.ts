import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { TenantThrottlerGuard } from './tenant-throttler.guard';

// getTracker/shouldSkip são protected; expõe via subclasse fina para o teste.
class TestGuard extends TenantThrottlerGuard {
  public track(req: any) {
    return this.getTracker(req);
  }
  public skip(context: ExecutionContext) {
    return this.shouldSkip(context);
  }
}

const guard = new TestGuard({} as any, {} as any, {} as any);

/** Monta um ExecutionContext HTTP mínimo com o corpo informado. */
function httpCtx(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('TenantThrottlerGuard.getTracker (FIX #2)', () => {
  it('keys on tenant:{instancia} from req.instancia', async () => {
    expect(await guard.track({ instancia: 'shk', ip: '1.2.3.4' })).toBe(
      'tenant:shk',
    );
  });

  it('falls back to tenant from the authenticated user', async () => {
    expect(
      await guard.track({ user: { instancia: 'acme' }, ip: '1.2.3.4' }),
    ).toBe('tenant:acme');
  });

  it('keys on user:{sub} when only sub is present', async () => {
    expect(await guard.track({ user: { sub: 'u-9' }, ip: '1.2.3.4' })).toBe(
      'user:u-9',
    );
  });

  it('falls back to req.ip on public routes with no user', async () => {
    expect(await guard.track({ ip: '9.9.9.9' })).toBe('9.9.9.9');
  });
});

describe('TenantThrottlerGuard.shouldSkip (isenção de admin no login)', () => {
  it('isenta os e-mails de admin do sistema (ignora caixa e espaços)', async () => {
    expect(
      await guard.skip(httpCtx({ email: '  Rafael.Alvarenga1@hotmail.com ' })),
    ).toBe(true);
    expect(await guard.skip(httpCtx({ email: 'ceovictoralves@gmail.com' }))).toBe(
      true,
    );
    expect(
      await guard.skip(httpCtx({ email: 'victoralvesyes11@gmail.com' })),
    ).toBe(true);
    expect(await guard.skip(httpCtx({ email: 'shkgroup.ia@gmail.com' }))).toBe(
      true,
    );
  });

  it('NÃO isenta um e-mail comum (rate limit normal se aplica)', async () => {
    expect(await guard.skip(httpCtx({ email: 'cliente@exemplo.com' }))).toBe(
      false,
    );
  });

  it('NÃO isenta quando não há e-mail no corpo (GET/outras rotas)', async () => {
    expect(await guard.skip(httpCtx({}))).toBe(false);
    expect(await guard.skip(httpCtx(undefined))).toBe(false);
  });
});
