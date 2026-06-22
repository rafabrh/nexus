import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards the Prometheus /metrics endpoint with a bearer scrape token.
 *  - METRICS_TOKEN set  → require `Authorization: Bearer <token>` (timing-safe).
 *  - METRICS_TOKEN unset → allowed outside production (dev tooling), denied in
 *    production so metrics are never exposed unauthenticated by accident.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('METRICS_TOKEN');

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Metrics endpoint not configured');
      }
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const auth = (req.headers?.authorization as string | undefined) ?? '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }
}
