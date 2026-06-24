import { describe, it, expect } from 'vitest';
import { TenantThrottlerGuard } from './tenant-throttler.guard';

// getTracker is protected; expose it via a thin subclass for the test.
class TestGuard extends TenantThrottlerGuard {
  public track(req: any) {
    return this.getTracker(req);
  }
}

const guard = new TestGuard({} as any, {} as any, {} as any);

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
