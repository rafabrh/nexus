import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import type { AiControlResponse } from '@nexus/shared';
import type { AiToggleRequestDto } from './dto/ai-toggle-request.dto';

@Injectable()
export class AiControlService {
  private readonly logger = new Logger(AiControlService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getState(instancia: string, jid: string): Promise<AiControlResponse> {
    const key = RedisKeys.humanControlUntil(instancia, jid);
    const value = await this.redis.get(key);

    if (!value) {
      return { state: 'ON', until: null };
    }

    const until = parseInt(value, 10);
    if (isNaN(until) || until <= Date.now()) {
      return { state: 'ON', until: null };
    }

    return {
      state: 'OFF_UNTIL',
      until: new Date(until).toISOString(),
    };
  }

  async toggle(instancia: string, jid: string, dto: AiToggleRequestDto): Promise<AiControlResponse> {
    const key = RedisKeys.humanControlUntil(instancia, jid);

    if (dto.state === 'ON') {
      await this.redis.del(key);
      this.logger.log(`IA turned ON for ${instancia}/${jid}`);
      return { state: 'ON', until: null };
    }

    // OFF or OFF_UNTIL
    const until = dto.expireAt
      ? new Date(dto.expireAt).getTime()
      : Date.now() + 24 * 60 * 60 * 1000; // 24h default

    await this.redis.set(key, until.toString());
    this.logger.log(`IA turned OFF_UNTIL ${new Date(until).toISOString()} for ${instancia}/${jid}`);

    return {
      state: 'OFF_UNTIL',
      until: new Date(until).toISOString(),
    };
  }
}
