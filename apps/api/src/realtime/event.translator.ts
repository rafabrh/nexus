import { Injectable } from '@nestjs/common';
import type { NexusEvent } from '@nexus/shared';

@Injectable()
export class EventTranslator {
  translate(channel: string, operation: string): NexusEvent | null {
    const key = channel.replace('__keyspace@0__:', '');
    const parts = key.split(':');
    const ts = Date.now();

    if (parts[0] === 'chat' && parts.length >= 4) {
      const instancia = parts[1];
      const jid = parts[2];
      const field = parts.slice(3).join(':');

      switch (field) {
        case 'humanControlUntil':
          return {
            type: 'ai.toggled',
            instancia,
            jid,
            ts,
            payload: {
              state: operation === 'del' || operation === 'expired' ? 'ON' : 'OFF',
            },
          };

        case 'buffer':
          if (operation === 'set' || operation === 'lpush') {
            return { type: 'message.received', instancia, jid, ts, payload: {} };
          }
          return null;

        case 'processing':
          if (operation === 'set') {
            return { type: 'ai.thinking', instancia, jid, ts, payload: {} };
          }
          if (operation === 'del' || operation === 'expired') {
            return { type: 'ai.responded', instancia, jid, ts, payload: {} };
          }
          return null;

        case 'paymentStatus':
          if (operation === 'set') {
            return { type: 'payment.approved', instancia, jid, ts, payload: {} };
          }
          return null;

        case 'followup_step':
          if (operation === 'set') {
            return { type: 'funnel.changed', instancia, jid, ts, payload: {} };
          }
          return null;

        default:
          return null;
      }
    }

    return null;
  }
}
