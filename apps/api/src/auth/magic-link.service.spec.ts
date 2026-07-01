import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MagicLinkService } from './magic-link.service';
import type { MailerService } from './mailer.service';

/**
 * In-memory Redis double that honors the `NX`/`EX` flags the service relies on
 * for the atomic resend cooldown. `set(key, val, 'EX', ttl, 'NX')` returns 'OK'
 * only when the key is absent (mirrors ioredis); without NX it always sets.
 */
function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
  } as any;
}

function makeConfig(values: Record<string, string | number | undefined>): ConfigService {
  return {
    get: (k: string, def?: unknown) => values[k] ?? def,
  } as unknown as ConfigService;
}

function makeMailer() {
  return { sendMagicLinkEmail: vi.fn(async () => undefined) } as unknown as MailerService & {
    sendMagicLinkEmail: ReturnType<typeof vi.fn>;
  };
}

/** The token stored for a magic link (magiclink:<uuid>, excluding the cooldown key). */
function tokenKeyOf(store: Map<string, string>): string | undefined {
  return [...store.keys()].find(
    (k) => k.startsWith('magiclink:') && !k.startsWith('magiclink:cooldown:'),
  );
}

beforeEach(() => vi.clearAllMocks());

describe('MagicLinkService — resend cooldown (nao lotar a caixa do cliente)', () => {
  it('first request sends exactly one email and stores a token', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    const svc = new MagicLinkService(redis, makeConfig({}), mailer);

    await svc.generateAndSend('user@x.com', 'shk', 'admin');

    expect(mailer.sendMagicLinkEmail).toHaveBeenCalledOnce();
    expect(tokenKeyOf(redis.store)).toBeDefined();
  });

  it('suppresses a repeated email while the cooldown is active (impatient re-click)', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    const svc = new MagicLinkService(redis, makeConfig({}), mailer);

    await svc.generateAndSend('user@x.com', 'shk', 'admin');
    await svc.generateAndSend('user@x.com', 'shk', 'admin');
    await svc.generateAndSend('user@x.com', 'shk', 'admin');

    // Three clicks, one email — the earlier link is still valid.
    expect(mailer.sendMagicLinkEmail).toHaveBeenCalledOnce();
  });

  it('does not suppress across distinct emails (cooldown is per-address)', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    const svc = new MagicLinkService(redis, makeConfig({}), mailer);

    await svc.generateAndSend('a@x.com', 'shk', 'admin');
    await svc.generateAndSend('b@x.com', 'shk', 'admin');

    expect(mailer.sendMagicLinkEmail).toHaveBeenCalledTimes(2);
  });

  it('consuming the link clears the cooldown so a fresh request sends again', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    const svc = new MagicLinkService(redis, makeConfig({}), mailer);

    await svc.generateAndSend('user@x.com', 'shk', 'admin');
    const token = tokenKeyOf(redis.store)!.slice('magiclink:'.length);

    const data = await svc.validate(token);
    expect(data?.email).toBe('user@x.com');

    // After a successful login, an immediate new request must NOT be suppressed.
    await svc.generateAndSend('user@x.com', 'shk', 'admin');
    expect(mailer.sendMagicLinkEmail).toHaveBeenCalledTimes(2);
  });

  it('releases the cooldown (and leaves no orphan token) when the email fails', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    mailer.sendMagicLinkEmail
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);
    const svc = new MagicLinkService(redis, makeConfig({}), mailer);

    await expect(svc.generateAndSend('user@x.com', 'shk', 'admin')).rejects.toThrow('smtp down');
    // No stuck cooldown and no dangling token after the failure.
    expect(tokenKeyOf(redis.store)).toBeUndefined();
    expect(redis.store.has('magiclink:cooldown:user@x.com')).toBe(false);

    // The immediate retry is NOT suppressed and succeeds.
    await svc.generateAndSend('user@x.com', 'shk', 'admin');
    expect(mailer.sendMagicLinkEmail).toHaveBeenCalledTimes(2);
  });

  it('honors MAGIC_LINK_RESEND_COOLDOWN_SECONDS as the cooldown TTL', async () => {
    const redis = makeRedis();
    const mailer = makeMailer();
    const svc = new MagicLinkService(redis, makeConfig({ MAGIC_LINK_RESEND_COOLDOWN_SECONDS: 30 }), mailer);

    await svc.generateAndSend('user@x.com', 'shk', 'admin');

    const cooldownSet = redis.set.mock.calls.find(
      (c: unknown[]) => String(c[0]).startsWith('magiclink:cooldown:'),
    );
    expect(cooldownSet).toBeDefined();
    // set(key, '1', 'EX', 30, 'NX')
    expect(cooldownSet).toEqual(['magiclink:cooldown:user@x.com', '1', 'EX', 30, 'NX']);
  });
});
