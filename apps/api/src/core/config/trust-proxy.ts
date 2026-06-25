/**
 * Resolve Fastify's `trustProxy` setting from the environment.
 *
 * Why this matters: the rate-limit guard keys on `request.ip`. Behind a reverse
 * proxy (production runs behind easypanel/traefik) the socket IP is the proxy's,
 * not the client's — so without trusting the proxy, EVERY user shares a single
 * `request.ip` and the per-IP rate limit silently becomes a global one (e.g.
 * magic-link 5/h for the whole platform). Trusting the proxy makes Fastify read
 * the real client IP from `X-Forwarded-For`.
 *
 * Defaults are safe:
 * - unset            → trust 1 hop in production (single proxy, not spoofable),
 *                      and `false` in dev (direct connections, no XFF to trust).
 * - "true" / "false" → trust all hops / none. NOTE: `true` trusts the leftmost
 *                      XFF entry, which a client can spoof — prefer a hop count.
 * - a whole number   → trust exactly that many proxy hops (recommended: the
 *                      number of proxies in front of the app).
 * - anything else    → passed through verbatim (single IP, CIDR, or comma list).
 */
export function resolveTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): boolean | number | string {
  const raw = env.TRUST_PROXY;

  if (raw == null || raw.trim() === '') {
    return env.NODE_ENV === 'production' ? 1 : false;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : raw;
}
