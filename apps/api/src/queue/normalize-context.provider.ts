import { Injectable, Inject, Optional } from '@nestjs/common';
import { nodeNormalizeContext, type NormalizeContext, type RawGatewayEvent } from '@nexus/shared';

/**
 * Fonte de configuração por instância que a **Fatia 2.3 (config store)** vai
 * prover. Até lá, o GO não tem como mapear `instanceId` (UUID) → nome canônico
 * nem descobrir o `ownerJid`, então roda com o stub vazio ({@link EmptyGatewayConfigStore}):
 * eventos GO dão drop no normalizer (logado como `evt.normalizer-drop`). O
 * caminho Node não depende disto (traz `instance` e `sender` no payload).
 *
 * TODO(Fatia 2.3): implementar contra `tenant:cfg:*` (Redis write-through do
 * config store) e prover via {@link GATEWAY_CONFIG_STORE} no QueueModule.
 */
export interface GatewayConfigStore {
  /** UUID da instância GO (whatsmeow) → nome canônico do painel/registry. */
  resolveInstanceId(instanceId: string): string | null;
  /** JID do dono da instância (o normalizer injeta no `sender` do GO). */
  ownerJid(instancia: string): string | undefined;
}

export const GATEWAY_CONFIG_STORE = 'GATEWAY_CONFIG_STORE';

/** Stub default — sem config store ainda (Fatia 2.3). GO não resolve; Node ignora. */
export class EmptyGatewayConfigStore implements GatewayConfigStore {
  resolveInstanceId(): string | null {
    return null;
  }
  ownerJid(): string | undefined {
    return undefined;
  }
}

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
