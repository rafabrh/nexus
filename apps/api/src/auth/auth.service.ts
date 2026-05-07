import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { NexusJwtService } from './jwt.service';
import { MagicLinkService } from './magic-link.service';
import { RedisKeys } from '@nexus/shared';
import type { TenantRegistry, TenantEntry } from '@nexus/shared';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jwt: NexusJwtService,
    private readonly magicLink: MagicLinkService,
  ) {}

  /**
   * Send a magic link email to the user.
   * Always returns success (even if email not found) to prevent enumeration.
   */
  async sendMagicLink(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Look up user in tenant registry
    const tenant = await this.findTenantByEmail(normalizedEmail);
    if (!tenant) {
      this.logger.warn(`Magic link requested for unknown email: ${normalizedEmail}`);
      // Do not throw — prevent email enumeration
      return;
    }

    const user = tenant.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail,
    );
    if (!user) {
      return;
    }

    await this.magicLink.generateAndSend(normalizedEmail, tenant.instancia, user.role);
    this.logger.log(`Magic link sent to ${normalizedEmail} for tenant ${tenant.instancia}`);
  }

  /**
   * Validate a magic link token and return JWT tokens.
   */
  async validateMagicLink(token: string): Promise<TokenPair> {
    const data = await this.magicLink.validate(token);
    if (!data) {
      throw new UnauthorizedException('Token invalido ou expirado');
    }

    const payload = {
      sub: data.email,
      instancia: data.instancia,
      role: data.role as 'admin' | 'operator',
    };

    const accessToken = await this.jwt.signAccess(payload);
    const refreshToken = await this.jwt.signRefresh(payload);

    this.logger.log(`Login successful for ${data.email} (${data.instancia})`);

    return { accessToken, refreshToken };
  }

  /**
   * Refresh the access token using a valid refresh token.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload;
    try {
      payload = await this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    // Check if jti is blacklisted
    const blacklisted = await this.redis.get(
      RedisKeys.sessionBlacklist(payload.jti!),
    );
    if (blacklisted) {
      throw new UnauthorizedException('Token revogado');
    }

    const accessToken = await this.jwt.signAccess({
      sub: payload.sub!,
      instancia: payload.instancia,
      role: payload.role,
    });

    return { accessToken };
  }

  /**
   * Logout — blacklist the JWT by its jti until it expires.
   */
  async logout(jti: string, exp: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(exp - now, 0);

    if (ttlSeconds > 0) {
      await this.redis.set(
        RedisKeys.sessionBlacklist(jti),
        'revoked',
        'EX',
        ttlSeconds,
      );
    }

    this.logger.log(`Token blacklisted: ${jti} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * Find the tenant entry that contains the given email.
   */
  private async findTenantByEmail(
    email: string,
  ): Promise<TenantEntry | null> {
    const raw = await this.redis.get(RedisKeys.tenantRegistry());
    if (!raw) return null;

    const registry: TenantRegistry = JSON.parse(raw);
    return (
      registry.tenants.find((t) =>
        t.users.some((u) => u.email.toLowerCase() === email),
      ) ?? null
    );
  }
}
