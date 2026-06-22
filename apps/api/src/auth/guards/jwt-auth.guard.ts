import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis.module';
import { NexusJwtService } from '../jwt.service';
import { RedisKeys } from '@nexus/shared';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: NexusJwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token ausente');
    }

    try {
      const payload = await this.jwt.verify(token);

      // A refresh token must never grant API access (it lives 30 days).
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Tipo de token invalido');
      }

      // Check if token is blacklisted (logout)
      const blacklisted = await this.redis.get(
        RedisKeys.sessionBlacklist(payload.jti!),
      );
      if (blacklisted) {
        throw new UnauthorizedException('Token revogado');
      }

      // Attach payload and tenant to request
      request.user = payload;
      request.instancia = payload.instancia;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token invalido');
    }
  }

  private extractToken(request: Record<string, unknown>): string | null {
    // Cookie first, then Authorization header
    const cookies = request.cookies as Record<string, string> | undefined;
    const fromCookie = cookies?.access_token;
    if (fromCookie) return fromCookie;

    const headers = request.headers as Record<string, string> | undefined;
    const auth = headers?.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    return null;
  }
}
