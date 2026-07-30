import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isRateLimitExemptEmail, resolveExemptEmails } from './rate-limit-exempt';

/**
 * Rate-limit tracker that scales past per-IP limiting.
 *
 * Per-IP buckets break behind corporate NAT/proxies: many distinct tenants can
 * share one egress IP and would starve each other's quota. For authenticated
 * routes we therefore key the bucket on the tenant (instancia) or, failing that,
 * the user (sub). Public routes (magic-link, etc.) have no user yet, so we fall
 * back to the IP — preserving the existing per-IP protection there.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  private readonly exemptEmails = resolveExemptEmails();

  /**
   * Isenta os admins do sistema do rate limit. No `POST /auth/magic-link` o
   * e-mail chega no CORPO do request (a rota é pública, sem JWT ainda), então a
   * decisão é por e-mail — a única identidade disponível nesse ponto. Retornar
   * `true` pula TODOS os throttlers da requisição. Fora do magic-link nenhum
   * corpo carrega `email`, então o caminho comum devolve `false` de imediato.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ body?: { email?: unknown } }>();
    return isRateLimitExemptEmail(req?.body?.email, this.exemptEmails);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.instancia) return `tenant:${req.instancia}`;
    if (req.user?.instancia) return `tenant:${req.user.instancia}`;
    if (req.user?.sub) return `user:${req.user.sub}`;
    return req.ip;
  }
}
