import { describe, it, expect, vi } from 'vitest';
import { EvolutionClient } from './evolution.client';

/**
 * probeState collapses the raw connectionState call into exists/absent/unknown.
 * The distinction is safety-critical: `unknown` (transient) must never be read
 * as `absent`, which would let callers destroy a live instance.
 */
function client() {
  const config = { get: vi.fn((_k: string, d?: string) => d ?? '') };
  return new EvolutionClient(config as never);
}

describe('EvolutionClient.probeState', () => {
  it('maps a live instance to { exists, state }', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockResolvedValue({ instance: { state: 'open' } });
    expect(await c.probeState('x')).toEqual({ status: 'exists', state: 'open' });
  });

  it('falls back to "close" when state is missing', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockResolvedValue({ instance: {} });
    expect(await c.probeState('x')).toEqual({ status: 'exists', state: 'close' });
  });

  it('maps a 404 to absent', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockRejectedValue(
      new Error('Evolution API 404: The "x" instance does not exist'),
    );
    expect(await c.probeState('x')).toEqual({ status: 'absent' });
  });

  it('maps a transient failure to unknown (never absent)', async () => {
    const c = client();
    vi.spyOn(c, 'getConnectionState').mockRejectedValue(new Error('fetch failed: ETIMEDOUT'));
    expect(await c.probeState('x')).toEqual({ status: 'unknown' });
  });
});
