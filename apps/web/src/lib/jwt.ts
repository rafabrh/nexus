/**
 * Client-side JWT claim decoding — for display and UX gating only.
 *
 * The server is the real authority (every protected route runs JwtAuthGuard +
 * RolesGuard). Never trust these claims for security decisions; hiding a button
 * client-side is convenience, not enforcement.
 */
export interface Claims {
  sub?: string;
  instancia?: string;
  role?: string;
}

export function decodeJwt(token: string | null): Claims {
  if (!token) return {};
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)) as Claims;
  } catch {
    return {};
  }
}

/** Whether the current token belongs to the platform superadmin. */
export function isSuperadmin(token: string | null): boolean {
  return decodeJwt(token).role === 'superadmin';
}
