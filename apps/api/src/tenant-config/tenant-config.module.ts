import { Module } from '@nestjs/common';
import { TenantEngineConfigRepository } from './tenant-engine-config.repository';
import { InMemoryGatewayConfigStore } from './in-memory-gateway-config.store';
import { TenantConfigService } from './tenant-config.service';

/**
 * Config store por tenant (§4.6). Sobe SEMPRE (importado no AppModule), mesmo com
 * o consumer da fila off: o reconcile no boot precisa espelhar o Postgres no Redis
 * e deixar o snapshot em memória quente. `DB` e `REDIS_CLIENT` são globais.
 *
 * Exporta o `InMemoryGatewayConfigStore` para o QueueModule bindar ao seam
 * (`GATEWAY_CONFIG_STORE`) e o `TenantConfigService` para escrita de config.
 */
@Module({
  providers: [TenantEngineConfigRepository, InMemoryGatewayConfigStore, TenantConfigService],
  exports: [InMemoryGatewayConfigStore, TenantConfigService],
})
export class TenantConfigModule {}
