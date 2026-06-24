import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisKeys } from '@nexus/shared';
import { EventsGateway } from './events.gateway';

function makeClient(token: string) {
  return {
    handshake: { auth: { token }, query: {} },
    data: {} as Record<string, any>,
    join: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    emit: vi.fn(),
  } as any;
}

function makeGateway(opts: {
  verify: any;
  blacklisted?: string | null;
}) {
  const jwt = { verify: vi.fn(async () => opts.verify) } as any;
  const publisher = { setServer: vi.fn() } as any;
  const replay = {} as any;
  const redis = { get: vi.fn(async () => opts.blacklisted ?? null) } as any;
  const gw = new EventsGateway(jwt, publisher, replay, redis);
  return { gw, jwt, redis };
}

const accessPayload = {
  sub: 'user-1',
  instancia: 'shk',
  role: 'operator',
  jti: 'jti-1',
  type: 'access',
};

describe('EventsGateway.handleConnection (FIX #1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disconnects and does NOT join when token type is refresh', async () => {
    const { gw, redis } = makeGateway({
      verify: { ...accessPayload, type: 'refresh' },
    });
    const client = makeClient('refresh-token');

    await gw.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
    // type check happens before blacklist lookup
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('disconnects when an access token is blacklisted (revoked at logout)', async () => {
    const { gw, redis } = makeGateway({
      verify: { ...accessPayload },
      blacklisted: '1',
    });
    const client = makeClient('revoked-token');

    await gw.handleConnection(client);

    expect(redis.get).toHaveBeenCalledWith(
      RedisKeys.sessionBlacklist('jti-1'),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins tenant:{instancia} for a valid, non-blacklisted access token', async () => {
    const { gw } = makeGateway({ verify: { ...accessPayload } });
    const client = makeClient('good-token');

    await gw.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('tenant:shk');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.instancia).toBe('shk');
    expect(client.data.user).toEqual(accessPayload);
  });

  it('disconnects when no token is supplied', async () => {
    const { gw, jwt } = makeGateway({ verify: { ...accessPayload } });
    const client = makeClient('');
    client.handshake.auth = {};
    client.handshake.query = {};

    await gw.handleConnection(client);

    expect(jwt.verify).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when signature verification throws', async () => {
    const { gw } = makeGateway({ verify: { ...accessPayload } });
    (gw as any).jwt.verify = vi.fn(async () => {
      throw new Error('bad signature');
    });
    const client = makeClient('tampered');

    await gw.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });
});
