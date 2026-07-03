import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';

/**
 * JIDs sob os quais as chaves de controle da IA (`humanControlUntil`) precisam
 * existir para que TANTO o painel QUANTO o fluxo N8N as encontrem.
 *
 * O painel usa o JID canônico (`resolvePersonalJid` → `{phone}@s.whatsapp.net`),
 * mas o N8N indexa pelo `key.remoteJid` CRU do webhook — que, com o endereçamento
 * `@lid` do WhatsApp, costuma ser `{lid}@lid`. O webhook grava o mapa `:rawjid`
 * (canônico → cru); aqui devolvemos o canônico e, quando existir e divergir, o
 * cru também. Assim o OFF/ON do painel e os comandos de chat do N8N convergem no
 * mesmo lugar. Degrada para só o canônico se o mapa não existir.
 */
export async function controlJids(
  redis: Redis,
  inst: string,
  jid: string,
): Promise<string[]> {
  try {
    const raw = await redis.get(RedisKeys.rawJid(inst, jid));
    if (raw && raw !== jid) return [jid, raw];
  } catch {
    /* Redis indisponível → opera só o canônico (comportamento anterior). */
  }
  return [jid];
}
