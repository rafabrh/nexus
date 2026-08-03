/**
 * Allowlist de e-mails ISENTOS do rate limit de login (magic-link).
 *
 * O throttle do `POST /auth/magic-link` é por IP (rota pública, sem usuário
 * ainda) e barra tentativas repetidas — o que atrapalha os donos do sistema
 * durante os testes. Estes e-mails (admins) ficam isentos do throttle.
 *
 * IMPORTANTE: o cooldown de reenvio por e-mail (90s, anti-flood — ver
 * `MagicLinkService`) permanece ativo mesmo para estes e-mails. Assim a isenção
 * do throttle NÃO vira um vetor para floodar a caixa do próprio admin: no máximo
 * um e-mail a cada 90s continua valendo.
 *
 * A lista base vive no código (donos fixos do sistema). `RATE_LIMIT_EXEMPT_EMAILS`
 * (CSV) estende a lista sem redeploy quando necessário.
 */
export const SYSTEM_ADMIN_EMAILS = [
  'rafael.alvarenga1@hotmail.com',
  'shkgroup.ia@gmail.com',
  'ceovictoralves@gmail.com',
  'victoralvesyes11@gmail.com',
] as const;

/** Normaliza um e-mail para comparação (trim + lowercase). */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve a allowlist final: a base embutida no código + os extras vindos do
 * env (`RATE_LIMIT_EXEMPT_EMAILS`, CSV), tudo normalizado. Entradas vazias são
 * descartadas.
 */
export function resolveExemptEmails(
  extraCsv: string | undefined = process.env.RATE_LIMIT_EXEMPT_EMAILS,
): Set<string> {
  const extra = (extraCsv ?? '')
    .split(',')
    .map((e) => normalize(e))
    .filter(Boolean);
  return new Set<string>([...SYSTEM_ADMIN_EMAILS, ...extra]);
}

/**
 * True quando o e-mail (vindo do corpo do request) está na allowlist de isenção.
 * Aceita `unknown` porque a origem é o corpo não validado do request.
 */
export function isRateLimitExemptEmail(
  email: unknown,
  exempt: Set<string>,
): boolean {
  return typeof email === 'string' && exempt.has(normalize(email));
}
