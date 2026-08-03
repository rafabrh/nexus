import { describe, it, expect } from 'vitest';
import type { RawGatewayEvent } from '@nexus/shared';
import {
  NormalizeContextProvider,
  type GatewayConfigStore,
} from './normalize-context.provider';

describe('NormalizeContextProvider', () => {
  describe('gateway node (completo hoje)', () => {
    const provider = new NormalizeContextProvider();

    it('resolveInstance é identidade sobre raw.instance', () => {
      const raw: RawGatewayEvent = { instance: 'shk', sender: '5511@s.whatsapp.net' };
      const ctx = provider.contextFor('node', raw);
      expect(ctx.gateway).toBe('node');
      expect(ctx.resolveInstance(raw)).toBe('shk');
    });

    it('ownerJid é undefined (Node traz sender no payload)', () => {
      const ctx = provider.contextFor('node', { instance: 'shk' });
      expect(ctx.ownerJid).toBeUndefined();
    });

    it('instance ausente/ inválida → resolveInstance null (drop)', () => {
      const ctx = provider.contextFor('node', {});
      expect(ctx.resolveInstance({})).toBeNull();
      expect(ctx.resolveInstance({ instance: '' })).toBeNull();
    });
  });

  describe('gateway go (seam do config store — Fatia 2.3)', () => {
    it('sem config store: resolveInstance null e ownerJid undefined (pendente 2.3)', () => {
      const provider = new NormalizeContextProvider();
      const ctx = provider.contextFor('go', { instanceId: 'uuid-abc' });
      expect(ctx.gateway).toBe('go');
      expect(ctx.resolveInstance({ instanceId: 'uuid-abc' })).toBeNull();
      expect(ctx.ownerJid?.('shk')).toBeUndefined();
    });

    it('com config store injetado: mapeia instanceId→instancia e resolve ownerJid', () => {
      const store: GatewayConfigStore = {
        resolveInstanceId: (id) => (id === 'uuid-abc' ? 'shk' : null),
        ownerJid: (inst) => (inst === 'shk' ? '5511@s.whatsapp.net' : undefined),
      };
      const provider = new NormalizeContextProvider(store);
      const ctx = provider.contextFor('go', { instanceId: 'uuid-abc' });
      expect(ctx.resolveInstance({ instanceId: 'uuid-abc' })).toBe('shk');
      expect(ctx.resolveInstance({ instanceId: 'desconhecida' })).toBeNull();
      expect(ctx.ownerJid?.('shk')).toBe('5511@s.whatsapp.net');
    });
  });
});
