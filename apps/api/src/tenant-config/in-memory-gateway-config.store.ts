import { Injectable } from '@nestjs/common';
import type { GatewayConfigStore } from './gateway-config-store';
import type { TenantEngineConfig } from './tenant-engine-config.types';

/**
 * Implementação SÍNCRONA do seam ({@link GatewayConfigStore}). O normalizer é
 * puro e resolve config DENTRO de si (por evento), então a resolução tem de ser
 * imediata — daqui, dois `Map`s em memória, hidratados a partir do Postgres pelo
 * {@link TenantConfigService} (boot + reconcile periódico). NUNCA faz I/O.
 */
@Injectable()
export class InMemoryGatewayConfigStore implements GatewayConfigStore {
  private byInstanceId = new Map<string, string>(); // UUID GO → instancia (nome canônico)
  private ownerByInstancia = new Map<string, string>(); // instancia → ownerJid
  private gatewayByInstancia = new Map<string, 'node' | 'go'>(); // instancia → gateway (só 'go' entra)

  /** Substitui o snapshot inteiro (idempotente; remoções no Postgres refletem). */
  hydrate(rows: { instancia: string; gateway?: string; config: TenantEngineConfig }[]): void {
    const byId = new Map<string, string>();
    const owner = new Map<string, string>();
    const gw = new Map<string, 'node' | 'go'>();
    for (const { instancia, gateway, config } of rows) {
      if (config.instanceId) byId.set(config.instanceId, instancia);
      if (config.ownerJid) owner.set(instancia, config.ownerJid);
      // Só 'go' entra no mapa; qualquer outro valor (ausente/inválido) cai no
      // default 'node' em gatewayFor — não precisa ocupar o mapa.
      if (gateway === 'go') gw.set(instancia, 'go');
    }
    this.byInstanceId = byId;
    this.ownerByInstancia = owner;
    this.gatewayByInstancia = gw;
  }

  resolveInstanceId(instanceId: string): string | null {
    return this.byInstanceId.get(instanceId) ?? null;
  }

  ownerJid(instancia: string): string | undefined {
    return this.ownerByInstancia.get(instancia);
  }

  /** Gateway do tenant p/ o router de saída. Desconhecido/ausente → 'node'. */
  gatewayFor(instancia: string): 'node' | 'go' {
    return this.gatewayByInstancia.get(instancia) ?? 'node';
  }
}
