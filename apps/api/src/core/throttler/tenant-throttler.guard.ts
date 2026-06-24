import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.instancia) return `tenant:${req.instancia}`;
    if (req.user?.instancia) return `tenant:${req.user.instancia}`;
    if (req.user?.sub) return `user:${req.user.sub}`;
    return req.ip;
  }
}
