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

  /** Substitui o snapshot inteiro (idempotente; remoções no Postgres refletem). */
  hydrate(rows: { instancia: string; config: TenantEngineConfig }[]): void {
    const byId = new Map<string, string>();
    const owner = new Map<string, string>();
    for (const { instancia, config } of rows) {
      if (config.instanceId) byId.set(config.instanceId, instancia);
      if (config.ownerJid) owner.set(instancia, config.ownerJid);
    }
    this.byInstanceId = byId;
    this.ownerByInstancia = owner;
  }

  resolveInstanceId(instanceId: string): string | null {
    return this.byInstanceId.get(instanceId) ?? null;
  }

  ownerJid(instancia: string): string | undefined {
    return this.ownerByInstancia.get(instancia);
  }
}
