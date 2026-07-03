import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import { controlJids } from './control-jids.util';

/**
 * True quando a IA está desligada para esta conversa — existe um
 * `humanControlUntil` (na chave canônica OU na cru `@lid`) com timestamp no
 * futuro. É a MESMA semântica que o `AiControlService.getState` usa, então o
 * BFF-gate (que barra o reencaminhamento pro N8N) e a UI concordam sobre o que
 * é "off".
 *
 * É a peça que torna o desligamento determinístico: o gate interno do fluxo N8N
 * se provou inconfiável (lê o `humanControlUntil` correto e responde assim
 * mesmo), então o BFF passa a enforçar o OFF na origem — não reencaminha a
 * mensagem quando isto retorna true.
 */
export async function isAiOff(
  redis: Redis,
  instancia: string,
  jid: string,
): Promise<boolean> {
  const jids = await controlJids(redis, instancia, jid);
  const values = await Promise.all(
    jids.map((j) => redis.get(RedisKeys.humanControlUntil(instancia, j))),
  );
  const now = Date.now();
  return values.some((v) => {
    const until = v ? parseInt(v, 10) : NaN;
    return !isNaN(until) && until > now;
  });
}
