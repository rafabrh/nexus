import { describe, it, expect } from 'vitest';
import { PhoneMask, resolveDisplayName } from './phone-mask';

describe('PhoneMask.isMasked', () => {
  it('detecta números/nomes mascarados (contêm asterisco)', () => {
    expect(PhoneMask.isMasked('11948**-****')).toBe(true);
    expect(PhoneMask.isMasked('+55 11 *****-1234')).toBe(true);
  });

  it('trata nomes e números reais como não-mascarados', () => {
    expect(PhoneMask.isMasked('João Cliente')).toBe(false);
    expect(PhoneMask.isMasked('5511948123456')).toBe(false);
    expect(PhoneMask.isMasked('')).toBe(false);
    expect(PhoneMask.isMasked(null)).toBe(false);
    expect(PhoneMask.isMasked(undefined)).toBe(false);
  });
});

describe('resolveDisplayName', () => {
  const jid = '5511948123456@s.whatsapp.net';

  it('mantém um nome de contato real', () => {
    expect(resolveDisplayName('João Cliente', jid)).toBe('João Cliente');
  });

  it('revela o número completo quando o nome gravado está mascarado', () => {
    const out = resolveDisplayName('11948**-****', jid);
    expect(out).not.toContain('*');
    expect(out).toBe(PhoneMask.reveal(jid));
  });

  it('revela o número completo quando não há nome', () => {
    expect(resolveDisplayName(null, jid)).toBe(PhoneMask.reveal(jid));
    expect(resolveDisplayName('', jid)).toBe(PhoneMask.reveal(jid));
    expect(resolveDisplayName('   ', jid)).toBe(PhoneMask.reveal(jid));
  });

  it('nunca emite asteriscos para jids @lid sem nome real', () => {
    const lid = '199233445566@lid';
    expect(resolveDisplayName(null, lid)).not.toContain('*');
  });

  it('remove espaços ao redor de um nome real', () => {
    expect(resolveDisplayName('  Maria  ', jid)).toBe('Maria');
  });
});
