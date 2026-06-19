import { describe, it, expect } from 'vitest';
import { jidFromPhone } from './jid';

describe('jidFromPhone', () => {
  it('appends the personal suffix to bare digits', () => {
    expect(jidFromPhone('5511952480228')).toBe('5511952480228@s.whatsapp.net');
  });

  it('returns a value that already carries an @ unchanged', () => {
    expect(jidFromPhone('5511@s.whatsapp.net')).toBe('5511@s.whatsapp.net');
    expect(jidFromPhone('262246475239430@lid')).toBe('262246475239430@lid');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(jidFromPhone('')).toBe('');
    expect(jidFromPhone(null)).toBe('');
    expect(jidFromPhone(undefined)).toBe('');
  });
});
