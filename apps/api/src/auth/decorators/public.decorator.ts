import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as exempt from the global `JwtAuthGuard`.
 * Deny-by-default: every route is authenticated unless it opts out with this.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
