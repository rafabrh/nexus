import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { ResendClient } from './resend.client';

interface MagicLinkData {
  email: string;
  instancia: string;
  role: string;
}

@Injectable()
export class MagicLinkService {
  private static readonly TTL_SECONDS = 900; // 15 minutes
  private readonly logger = new Logger(MagicLinkService.name);
  private readonly baseUrl: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly resend: ResendClient,
  ) {
    this.baseUrl = this.config.get<string>(
      'MAGIC_LINK_BASE_URL',
      'http://localhost:3000/auth/callback',
    );
  }

  /**
   * Generate a magic link token, store it in Redis, and send the email.
   */
  async generateAndSend(
    email: string,
    instancia: string,
    role: string,
  ): Promise<void> {
    const token = randomUUID();
    const data: MagicLinkData = { email, instancia, role };

    // Store in Redis with TTL
    await this.redis.set(
      RedisKeys.magicLink(token),
      JSON.stringify(data),
      'EX',
      MagicLinkService.TTL_SECONDS,
    );

    // Build the magic link URL
    const magicLinkUrl = `${this.baseUrl}?token=${token}`;

    // Send email
    await this.resend.sendMagicLinkEmail(email, magicLinkUrl);

    this.logger.log(`Magic link generated for ${email} (expires in ${MagicLinkService.TTL_SECONDS}s)`);
  }

  /**
   * Validate a magic link token. Returns the stored data and deletes the token.
   * Returns null if the token is invalid or expired.
   */
  async validate(token: string): Promise<MagicLinkData | null> {
    const key = RedisKeys.magicLink(token);
    const raw = await this.redis.get(key);

    if (!raw) {
      this.logger.warn(`Magic link token not found or expired: ${token.slice(0, 8)}...`);
      return null;
    }

    // Delete token immediately (single-use)
    await this.redis.del(key);

    try {
      return JSON.parse(raw) as MagicLinkData;
    } catch {
      this.logger.error(`Failed to parse magic link data for token: ${token}`);
      return null;
    }
  }
}
