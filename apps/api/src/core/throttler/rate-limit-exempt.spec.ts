import { describe, it, expect } from 'vitest';
import {
  resolveExemptEmails,
  isRateLimitExemptEmail,
  SYSTEM_ADMIN_EMAILS,
} from './rate-limit-exempt';

describe('resolveExemptEmails', () => {
  it('inclui os admins do sistema por padrão', () => {
    const set = resolveExemptEmails(undefined);
    for (const email of SYSTEM_ADMIN_EMAILS) {
      expect(set.has(email)).toBe(true);
    }
  });

  it('estende com RATE_LIMIT_EXEMPT_EMAILS (CSV) normalizado, ignorando vazios', () => {
    const set = resolveExemptEmails('Extra@X.com, outro@Y.com , ');
    expect(set.has('extra@x.com')).toBe(true);
    expect(set.has('outro@y.com')).toBe(true);
    expect(set.has('')).toBe(false);
  });
});

describe('isRateLimitExemptEmail', () => {
  const set = resolveExemptEmails('');

  it('true para admin do sistema (ignora caixa e espaços)', () => {
    expect(isRateLimitExemptEmail('  SHKGROUP.IA@gmail.com ', set)).toBe(true);
    expect(isRateLimitExemptEmail('ceovictoralves@gmail.com', set)).toBe(true);
  });

  it('false para não-admin ou valor não-string', () => {
    expect(isRateLimitExemptEmail('cliente@exemplo.com', set)).toBe(false);
    expect(isRateLimitExemptEmail(undefined, set)).toBe(false);
    expect(isRateLimitExemptEmail(123 as unknown, set)).toBe(false);
  });
});
