import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles required — allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;

    if (!user?.role) {
      throw new ForbiddenException('Acesso negado — role nao encontrada');
    }

    // superadmin (dono da plataforma) acessa qualquer rota protegida por role.
    // Hierarquia superadmin > admin > operator — evita listar 'superadmin' em
    // todo @Roles() e mantém o gate cross-tenant restrito a ele.
    if (user.role === 'superadmin') {
      return true;
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Acesso negado — requer role: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
