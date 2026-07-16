import { describe, it, expect } from 'vitest';
import { signMedia, verifyMedia } from './media-signature.util';

const SECRET = 'test-secret-key';
const INST = 'inst1';
const MEDIA_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('signMedia / verifyMedia', () => {
  it('assina e verifica válido dentro do prazo', () => {
    const { exp, sig } = signMedia(INST, MEDIA_ID, 300, SECRET);
    expect(verifyMedia(INST, MEDIA_ID, exp, sig, SECRET)).toBe(true);
  });

  it('rejeita assinatura adulterada', () => {
    const { exp } = signMedia(INST, MEDIA_ID, 300, SECRET);
    expect(verifyMedia(INST, MEDIA_ID, exp, 'invalidsig', SECRET)).toBe(false);
  });

  it('rejeita expirada (exp no passado)', () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const { sig } = signMedia(INST, MEDIA_ID, 0, SECRET);
    // re-sign with past exp to get a valid sig for that exp
    const { sig: sigPast } = signMedia(INST, MEDIA_ID, -10, SECRET);
    expect(verifyMedia(INST, MEDIA_ID, exp, sigPast, SECRET)).toBe(false);
  });

  it('rejeita mediaId trocado', () => {
    const { exp, sig } = signMedia(INST, MEDIA_ID, 300, SECRET);
    expect(verifyMedia(INST, 'other-uuid-0000-0000-000000000000', exp, sig, SECRET)).toBe(false);
  });
});
