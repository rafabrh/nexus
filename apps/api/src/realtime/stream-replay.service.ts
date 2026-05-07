import { Injectable } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import type { NexusEventEnvelope } from '@nexus/shared';

@Injectable()
export class StreamReplayService {
  constructor(private readonly redis: RedisService) {}

  async getEventsSince(instancia: string, lastEventId: string): Promise<NexusEventEnvelope[]> {
    const streamKey = `events:${instancia}`;
    const entries = await this.redis.xrange(streamKey, lastEventId, '+', 500);

    return entries
      .filter(([id]) => id !== lastEventId)
      .map(([id, fields]) => {
        const data = JSON.parse(fields[1]);
        return { ...data, eventId: id };
      });
  }
}
