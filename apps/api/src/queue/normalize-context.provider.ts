import { Injectable, Inject, Optional } from '@nestjs/common';
import { nodeNormalizeContext, type NormalizeContext, type RawGatewayEvent } from '@nexus/shared';
import {
  GATEWAY_CONFIG_STORE,
  EmptyGatewayConfigStore,
  type GatewayConfigStore,
} from '../tenant-config/gateway-config-store';

// Reexporta o contrato do seam (agora dono em tenant-config/) para não quebrar
// os imports existentes que o resolvem por este módulo.
export { GATEWAY_CONFIG_STORE, EmptyGatewayConfigStore, type GatewayConfigStore };

/**
 * Monta o {@link NormalizeContext} para um evento cru, conforme o gateway de
 * origem. O normalizer é PURO; toda resolução externa (instância, dono) entra
 * por aqui. Node é completo hoje; GO fica atrás do seam do config store.
 */
@Injectable()
export class NormalizeContextProvider {
  private readonly store: GatewayConfigStore;

  constructor(
    @Optional() @Inject(GATEWAY_CONFIG_STORE) store?: GatewayConfigStore,
  ) {
    this.store = store ?? new EmptyGatewayConfigStore();
  }

  contextFor(gateway: 'node' | 'go', _raw: RawGatewayEvent): NormalizeContext {
    if (gateway === 'node') {
      // Contexto Node é puro (identidade) e vive em @nexus/shared, ao lado do
      // normalizer — o boundary HTTP reusa o MESMO helper, sem acoplamento.
      return nodeNormalizeContext();
    }
    // GO traz `instanceId` (UUID) → mapeado pelo config store (vazio até a 2.3).
    // ownerJid é injetado porque o payload GO não carrega `sender`.
    return {
      gateway: 'go',
      resolveInstance: (raw) =>
        typeof raw.instanceId === 'string'
          ? this.store.resolveInstanceId(raw.instanceId)
          : null,
      ownerJid: (instancia) => this.store.ownerJid(instancia),
    };
  }
}
