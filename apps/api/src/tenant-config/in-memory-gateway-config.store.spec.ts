import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGatewayConfigStore } from './in-memory-gateway-config.store';

describe('InMemoryGatewayConfigStore', () => {
  let store: InMemoryGatewayConfigStore;
  beforeEach(() => {
    store = new InMemoryGatewayConfigStore();
  });

  it('resolve SÍNCRONO após hidratar: instanceId→instancia e ownerJid', () => {
    store.hydrate([
      { instancia: 'Shkgroup', config: { instanceId: 'uuid-1', ownerJid: '55@s.whatsapp.net' } },
    ]);
    expect(store.resolveInstanceId('uuid-1')).toBe('Shkgroup');
    expect(store.ownerJid('Shkgroup')).toBe('55@s.whatsapp.net');
  });

  it('desconhecidos → null / undefined', () => {
    store.hydrate([{ instancia: 'Shkgroup', config: { instanceId: 'uuid-1' } }]);
    expect(store.resolveInstanceId('uuid-inexistente')).toBeNull();
    expect(store.ownerJid('Geotech')).toBeUndefined();
  });

  it('hydrate SUBSTITUI o snapshot inteiro (remoções refletem)', () => {
    store.hydrate([{ instancia: 'Shkgroup', config: { instanceId: 'uuid-1', ownerJid: 'a@x' } }]);
    store.hydrate([]); // tenant removido do Postgres
    expect(store.resolveInstanceId('uuid-1')).toBeNull();
    expect(store.ownerJid('Shkgroup')).toBeUndefined();
  });

  it('config sem instanceId/ownerJid não polui os mapas', () => {
    store.hydrate([{ instancia: 'NodeTenant', config: {} }]);
    expect(store.resolveInstanceId('')).toBeNull();
    expect(store.ownerJid('NodeTenant')).toBeUndefined();
  });

  it('antes de hidratar, resolve vazio (não quebra o boot)', () => {
    expect(store.resolveInstanceId('qualquer')).toBeNull();
    expect(store.ownerJid('qualquer')).toBeUndefined();
  });
});
