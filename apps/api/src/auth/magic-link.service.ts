import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { MailerService } from './mailer.service';

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
  private readonly resendCooldownSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {
    this.baseUrl = this.config.get<string>(
      'MAGIC_LINK_BASE_URL',
      'http://localhost:3000/auth/callback',
    );
    // Janela em que um novo pedido do MESMO email nao dispara outro email.
    // Curta o bastante para permitir reenvio se o email atrasar (spam/fila),
    // longa o bastante para colapsar a rajada de cliques na tela de login.
    // Um valor de env invalido (NaN/<=0) nunca chega ao `SET EX`: cai no default.
    const cooldown = Number(
      this.config.get('MAGIC_LINK_RESEND_COOLDOWN_SECONDS', 90),
    );
    this.resendCooldownSeconds =
      Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 90;
  }

  /**
   * Generate a magic link token, store it in Redis, and send the email.
   *
   * Resend cooldown (minimizacao LGPD / anti-spam): enquanto houver um envio
   * recente para este email, nao geramos outro token nem outro email — o link
   * anterior ainda e valido (cooldown < TTL do token). O `SET ... NX` e atomico,
   * entao cliques concorrentes na tela de login nao viram uma rajada de emails.
   */
  async generateAndSend(
    email: string,
    instancia: string,
    role: string,
  ): Promise<void> {
    const acquired = await this.redis.set(
      RedisKeys.magicLinkCooldown(email),
      '1',
      'EX',
      this.resendCooldownSeconds,
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.log(`magic-link.resend-suppressed email=${email} (cooldown ativo)`);
      return;
    }

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

    // Se o envio falhar, nao segure o cooldown nem deixe um token orfao: o
    // usuario deve poder tentar de novo na hora, sem esperar a janela expirar.
    try {
      await this.mailer.sendMagicLinkEmail(email, magicLinkUrl);
    } catch (err) {
      await this.redis.del(RedisKeys.magicLinkCooldown(email));
      await this.redis.del(RedisKeys.magicLink(token));
      throw err;
    }

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
      const data = JSON.parse(raw) as MagicLinkData;
      // Consumir o link libera o cooldown de reenvio: apos logar, o usuario pode
      // pedir um novo link na hora (ex.: outro dispositivo) sem esperar a janela.
      await this.redis.del(RedisKeys.magicLinkCooldown(data.email));
      return data;
    } catch {
      this.logger.error(`Failed to parse magic link data for token: ${token}`);
      return null;
    }
  }
}
