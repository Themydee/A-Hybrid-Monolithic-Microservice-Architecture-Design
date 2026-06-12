import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { OpaService } from './opa.service';
import type { Request } from 'express';

@Injectable()
export class OpaGuard implements CanActivate {
  constructor(private readonly opaService: OpaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      return false;
    }

    const cleanPath = request.path.split('?')[0];
    const pathSegments = cleanPath.split('/').filter(Boolean);

    // Extract resource owner metadata for Attribute-Based access checks
    const resourceOwnerId =
      request.params?.id || request.params?.userId || request.body?.userId || request.query?.userId || null;

    const input = {
      user: {
        id: user.userId,
        roles: user.roles,
        permissions: user.permissions,
      },
      action: request.method,
      path: pathSegments,
      resource_owner_id: resourceOwnerId,
    };

    // Evaluate via OPA
    const allowed = await this.opaService.evaluate('authz/allow', input);
    if (!allowed) {
      throw new ForbiddenException('Access Denied (Enforced by OPA)');
    }

    return true;
  }
}
