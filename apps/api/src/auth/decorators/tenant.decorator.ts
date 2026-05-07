import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Extract the tenant instance name from the request.
 * The value comes from the JWT payload (set by JwtAuthGuard).
 *
 * Usage:
 *   @Tenant() instancia: string
 */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.instancia as string;
  },
);
