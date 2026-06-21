import { Injectable } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import type { NexusEventEnvelope } from '@nexus/shared';

@Injectable()
export class StreamReplayService {
  constructor(private readonly redis: RedisService) {}

  async getEventsSince(instancia: string, lastEventId: string): Promise<NexusEventEnvelope[]> {
    const streamKey = `events:${instancia}`;

    // A valid stream ID is "ms-seq" (or just "ms"). Anything else (e.g. a legacy
    // synthetic id from an old client) makes Redis throw "Invalid stream ID", so
    // fall back to replaying from the start of the stream. When valid, use an
    // exclusive start "(id" so the client doesn't receive the event it already has.
    const valid = /^\d+(-\d+)?$/.test(lastEventId);
    const start = valid ? `(${lastEventId}` : '-';

    const entries = await this.redis.xrange(streamKey, start, '+', 500);

    return entries.map(([id, fields]) => {
      const data = JSON.parse(fields[1]);
      return { ...data, eventId: id };
    });
  }
}
