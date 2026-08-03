import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionClient } from './evolution.client';
import type { EvolutionGateway } from './evolution-gateway.port';
import type { InMemoryGatewayConfigStore } from '../tenant-config/in-memory-gateway-config.store';

/**
 * O `EvolutionClient` é um ROUTER: por instância (1º argumento de todo método),
 * resolve o gateway do tenant (`gatewayFor`) e delega ao adapter `node` ou `go`
 * com os MESMOS argumentos. Os consumidores injetam o mesmo token e não mudam.
 */
describe('EvolutionClient (router)', () => {
  let node: Record<string, ReturnType<typeof vi.fn>>;
  let go: Record<string, ReturnType<typeof vi.fn>>;
  let gateways: { gatewayFor: ReturnType<typeof vi.fn> };
  let router: EvolutionClient;

  beforeEach(() => {
    node = {
      sendTextMessage: vi.fn().mockResolvedValue({ from: 'node' }),
      sendMedia: vi.fn().mockResolvedValue({ from: 'node' }),
      getConnectionState: vi.fn().mockResolvedValue({ from: 'node' }),
    };
    go = {
      sendTextMessage: vi.fn().mockResolvedValue({ from: 'go' }),
      sendMedia: vi.fn().mockResolvedValue({ from: 'go' }),
      getConnectionState: vi.fn().mockResolvedValue({ from: 'go' }),
    };
    gateways = { gatewayFor: vi.fn() };
    router = new EvolutionClient(
      node as unknown as EvolutionGateway,
      go as unknown as EvolutionGateway,
      gateways as unknown as InMemoryGatewayConfigStore,
    );
  });

  it('roteia p/ o adapter node quando gatewayFor retorna "node", com os MESMOS args', async () => {
    gateways.gatewayFor.mockReturnValue('node');

    await router.sendTextMessage('Shk', 'jid', 'oi');

    expect(node.sendTextMessage).toHaveBeenCalledWith('Shk', 'jid', 'oi', undefined);
    expect(go.sendTextMessage).not.toHaveBeenCalled();
  });

  it('roteia p/ o adapter go quando gatewayFor retorna "go", sem tocar no node', async () => {
    gateways.gatewayFor.mockReturnValue('go');

    await router.sendTextMessage('Shk', 'jid', 'oi');

    expect(go.sendTextMessage).toHaveBeenCalledWith('Shk', 'jid', 'oi', undefined);
    expect(node.sendTextMessage).not.toHaveBeenCalled();
  });

  it('decide pelo 1º argumento (instancia): gatewayFor recebe a instância', async () => {
    gateways.gatewayFor.mockReturnValue('node');

    await router.getConnectionState('Geotech');

    expect(gateways.gatewayFor).toHaveBeenCalledWith('Geotech');
    expect(node.getConnectionState).toHaveBeenCalledWith('Geotech');
  });

  it('roteia métodos com mais args (sendMedia) preservando o objeto de opts', async () => {
    gateways.gatewayFor.mockReturnValue('node');
    const opts = { mediatype: 'image' as const, media: 'base64data' };

    await router.sendMedia('Shk', 'jid', opts);

    expect(gateways.gatewayFor).toHaveBeenCalledWith('Shk');
    expect(node.sendMedia).toHaveBeenCalledWith('Shk', 'jid', opts);
    expect(go.sendMedia).not.toHaveBeenCalled();
  });
});
