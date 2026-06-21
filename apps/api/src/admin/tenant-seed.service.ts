import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';

/**
 * Dev-only safety net for the tenant registry.
 *
 * The whole login flow resolves an email to a tenant via Postgres
 * (TenantRepository.findByEmail). Against a fresh/empty database there are no
 * tenants, so every magic-link request resolves to "unknown email" and nobody
 * can log in. This seeds a single admin tenant on boot so local development just
 * works.
 *
 * Two independent guards keep this out of production:
 *  1. NODE_ENV === 'production' → never runs.
 *  2. Opt-in: only runs when SEED_INSTANCE is configured (absent in prod env).
 *
 * It only acts on a *completely empty* registry — a populated registry is
 * assumed to be managed via the admin API and is never touched. Any failure is
 * swallowed so a seed problem can never block application startup.
 */
@Injectable()
export class TenantSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantSeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tenants: TenantService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    const instancia = this.config.get<string>('SEED_INSTANCE');
    if (!instancia) return; // disabled unless explicitly configured

    const adminEmail =
      this.config.get<string>('SEED_ADMIN_EMAIL') ||
      this.config.get<string>('ADMIN_EMAIL');
    if (!adminEmail) return;

    try {
      const existing = await this.tenants.listTenants();
      if (existing.length > 0) return; // never overwrite a managed registry

      await this.tenants.registerTenant(instancia, adminEmail);
      this.logger.warn(
        `dev-seed: empty registry — seeded admin tenant '${instancia}' for ${adminEmail}. Not for production use.`,
      );
    } catch (err) {
      // A seed failure must never block startup.
      this.logger.warn(`dev-seed skipped: ${(err as Error).message}`);
    }
  }
}
