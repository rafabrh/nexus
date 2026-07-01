import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { n8nForwardPolicy } from '../core/resilience/policies';

/** TTL da chave de dedup — cobre a janela de retry da Evolution. */
const DEDUP_TTL_SECONDS = 300;
const FORWARD_TIMEOUT_MS = 8_000;

/**
 * Reencaminha o payload CRU da Evolution para o webhook do fluxo N8N do tenant.
 * Transparente: o N8N recebe exatamente o que receberia direto da Evolution.
 * Idempotente por `key.id` (retry de webhook nao faz a IA responder 2x) e
 * NUNCA propaga erro — uma falha do N8N nao pode derrubar o caminho do webhook.
 */
@Injectable()
export class N8nForwarderService {
  private readonly logger = new Logger(N8nForwarderService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async forward(
    instancia: string,
    n8nWebhookUrl: string | null,
    msgId: string | null,
    rawPayload: unknown,
  ): Promise<void> {
    if (!n8nWebhookUrl) {
      this.logger.warn(`n8n.forward-skipped instancia=${instancia} reason=no-url`);
      return;
    }

    if (msgId) {
      const first = await this.redis.set(
        RedisKeys.n8nForwardDedup(instancia, msgId),
        '1',
        'EX',
        DEDUP_TTL_SECONDS,
        'NX',
      );
      if (first !== 'OK') {
        this.logger.debug(`n8n.forward-dup instancia=${instancia} msgId=${msgId}`);
        return;
      }
    }

    try {
      await n8nForwardPolicy.execute(async () => {
        const res = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rawPayload),
          signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`N8N webhook ${res.status}`);
      });
    } catch (err) {
      this.logger.error(`n8n.forward-failed instancia=${instancia}: ${(err as Error).message}`);
    }
  }
}
