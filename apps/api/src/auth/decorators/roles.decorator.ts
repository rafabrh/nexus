import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to define required roles for a route.
 *
 * Usage:
 *   @Roles('admin')
 *   @Roles('admin', 'operator')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
