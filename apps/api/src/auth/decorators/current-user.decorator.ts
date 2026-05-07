import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { NexusJwtPayload } from '../jwt.service';

/**
 * Extract the current authenticated user from the request.
 *
 * Usage:
 *   @CurrentUser() user: NexusJwtPayload
 *   @CurrentUser('sub') email: string
 *   @CurrentUser('instancia') instancia: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof NexusJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as NexusJwtPayload;
    return data ? user[data] : user;
  },
);
