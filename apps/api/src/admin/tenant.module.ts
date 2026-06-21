import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantRepository } from './tenant.repository';

/**
 * Módulo global de tenants. Expõe TenantRepository (acesso Postgres) e
 * TenantService (API do painel) para auth, webhook, onboarding e conversation
 * sem acoplamento circular entre módulos. Depende apenas do DbModule global.
 */
@Global()
@Module({
  providers: [TenantRepository, TenantService],
  exports: [TenantRepository, TenantService],
})
export class TenantModule {}
