/**
 * Contrato do seam de configuração por instância — consumido pelo normalizer
 * (via `NormalizeContextProvider`, Fatia 2.2) e implementado pelo config store
 * (Fatia 2.3). Vive em `tenant-config/` (owner natural da config) para que a
 * direção de dependência seja única: `queue` → `tenant-config`.
 *
 * **SÍNCRONO por contrato:** o normalizer é uma função pura e chama estes
 * métodos dentro de si; a resolução vem sempre de um snapshot em memória
 * ({@link InMemoryGatewayConfigStore}), NUNCA de I/O async por evento.
 */
export interface GatewayConfigStore {
  /** UUID da instância GO (whatsmeow) → nome canônico do painel/registry. */
  resolveInstanceId(instanceId: string): string | null;
  /** JID do dono da instância (o normalizer injeta no `sender` do GO). */
  ownerJid(instancia: string): string | undefined;
}

export const GATEWAY_CONFIG_STORE = 'GATEWAY_CONFIG_STORE';

/** Stub — usado quando o config store ainda não foi provido. GO não resolve; Node ignora. */
export class EmptyGatewayConfigStore implements GatewayConfigStore {
  resolveInstanceId(): string | null {
    return null;
  }
  ownerJid(): string | undefined {
    return undefined;
  }
}
