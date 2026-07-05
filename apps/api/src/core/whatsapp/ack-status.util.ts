/**
 * Status de entrega/leitura (ACK) de uma mensagem de SAÍDA, no vocabulário do
 * painel. Ordem de avanço: sent < delivered < read < played.
 */
export type AckStatus = 'sent' | 'delivered' | 'read' | 'played';

/** Ranking do avanço — usado no CAS (nunca rebaixa) e para escolher o maior. */
export const ACK_RANKS: Record<AckStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  played: 4,
};

/**
 * CAS atômico do status de ACK (read-compare-write num único passo no Redis). Só
 * grava quando o novo status é um AVANÇO no ranking (sent<delivered<read<played);
 * o ranking vive dentro do script para não haver janela entre HGET e HSET. Sem
 * isto, dois updates concorrentes do mesmo msgId poderiam intercalar e REBAIXAR
 * o status (ex.: `read` sobrescrito por um `delivered` atrasado). Retorna 1 se
 * avançou, 0 caso contrário. KEYS[1]=hash, ARGV[1]=msgId, ARGV[2]=status.
 */
export const ACK_CAS_LUA = `
local ranks = { sent = 1, delivered = 2, read = 3, played = 4 }
local cur = redis.call('HGET', KEYS[1], ARGV[1])
local curRank = 0
if cur and ranks[cur] then curRank = ranks[cur] end
local newRank = ranks[ARGV[2]] or 0
if newRank <= curRank then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1
`;

/**
 * Mapeia UM valor de status de ACK da Evolution/Baileys para o enum do painel.
 * Aceita o numérico WAMessageStatus (2=servidor..5=reproduzido) — como number ou
 * string de dígitos ("3"), que algumas versões enviam — e o enum textual do
 * Baileys (SERVER_ACK/DELIVERY_ACK/READ/PLAYED, ou variações que contenham essas
 * palavras). Retorna null para valores desconhecidos/ausentes.
 */
export function mapEvolutionAck(raw: unknown): AckStatus | null {
  if (raw == null) return null;

  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? parseInt(raw.trim(), 10)
        : null;
  if (num != null) {
    if (num >= 5) return 'played';
    if (num === 4) return 'read';
    if (num === 3) return 'delivered';
    if (num === 2) return 'sent';
    return null;
  }

  const s = String(raw).toUpperCase();
  if (s.includes('PLAYED')) return 'played';
  if (s.includes('READ')) return 'read';
  if (s.includes('DELIVERY') || s === 'DELIVERED') return 'delivered';
  if (s.includes('SERVER') || s === 'SENT') return 'sent';
  return null;
}

/**
 * Dado um conjunto de valores de status (ex.: o array `MessageUpdate` da Evolution,
 * que vem FORA DE ORDEM), devolve o de MAIOR avanço já reconhecido, ou null se
 * nenhum for reconhecido. É isto que faz um `read` intercalado com `delivered`
 * resultar em `read`.
 */
export function highestAck(raws: readonly unknown[]): AckStatus | null {
  let best: AckStatus | null = null;
  let bestRank = 0;
  for (const raw of raws) {
    const mapped = mapEvolutionAck(raw);
    if (!mapped) continue;
    const rank = ACK_RANKS[mapped];
    if (rank > bestRank) {
      best = mapped;
      bestRank = rank;
    }
  }
  return best;
}
