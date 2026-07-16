import { createHmac, timingSafeEqual } from 'crypto';

function computeSig(inst: string, mediaId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${inst}:${mediaId}:${exp}`)
    .digest('hex');
}

export function signMedia(
  inst: string,
  mediaId: string,
  ttlSeconds: number,
  secret: string,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = computeSig(inst, mediaId, exp, secret);
  return { exp, sig };
}

export function verifyMedia(
  inst: string,
  mediaId: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;

  const expected = computeSig(inst, mediaId, exp, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
