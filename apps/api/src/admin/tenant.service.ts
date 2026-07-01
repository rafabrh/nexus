import { Injectable, Logger } from '@nestjs/common';
import { TenantRepository } from './tenant.repository';
import type { TenantEntry, TenantUser } from '@nexus/shared';

/**
 * API de tenants do painel. Antes guardava todo o cadastro num único blob
 * `tenant:registry` no Redis (read-modify-write sem lock → lost update). Agora
 * delega ao TenantRepository (Postgres), onde cada operação é transacional e
 * por linha. A interface pública foi preservada — controllers, dev-seed, auth,
 * webhook e onboarding continuam iguais.
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly repo: TenantRepository) {}

  async listTenants(): Promise<TenantEntry[]> {
    return this.repo.list();
  }

  async getTenant(instancia: string): Promise<TenantEntry | null> {
    return this.repo.get(instancia);
  }

  async registerTenant(instancia: string, adminEmail: string): Promise<TenantEntry> {
    const entry = await this.repo.register(instancia, adminEmail);
    this.logger.log(`Tenant registered: ${instancia} (${adminEmail})`);
    return entry;
  }

  async toggleTenant(instancia: string, active: boolean): Promise<TenantEntry | null> {
    const entry = await this.repo.setActive(instancia, active);
    if (entry) {
      this.logger.log(`Tenant ${instancia} ${active ? 'activated' : 'deactivated'}`);
    }
    return entry;
  }

  async setN8nWebhookUrl(instancia: string, url: string | null): Promise<TenantEntry | null> {
    const entry = await this.repo.setN8nWebhookUrl(instancia, url);
    if (entry) {
      this.logger.log(`Tenant ${instancia} n8nWebhookUrl ${url ? 'set' : 'cleared'}`);
    }
    return entry;
  }

  /**
   * Adota uma instância que JÁ existe na Evolution (ex.: Shkgroup): registra o
   * tenant no painel e grava sua n8nWebhookUrl numa só operação. Não cria nada na
   * Evolution — apenas passa a gerenciá-la pelo painel. Reusa a guarda cross-tenant
   * do register (não anexa a instância de outro dono). O instanceState/conexão se
   * resolve no primeiro webhook (connection.update) que agora será processado.
   */
  async adoptInstance(
    instancia: string,
    adminEmail: string,
    n8nWebhookUrl: string,
  ): Promise<TenantEntry> {
    const entry = await this.repo.register(instancia, adminEmail);
    const withUrl = await this.repo.setN8nWebhookUrl(instancia, n8nWebhookUrl);
    this.logger.log(`Tenant adopted: ${instancia} (${adminEmail}) + n8nWebhookUrl`);
    return withUrl ?? entry;
  }

  async addUser(instancia: string, user: TenantUser): Promise<TenantEntry | null> {
    return this.repo.addUser(instancia, user);
  }

  async removeUser(instancia: string, email: string): Promise<TenantEntry | null> {
    return this.repo.removeUser(instancia, email);
  }
}
