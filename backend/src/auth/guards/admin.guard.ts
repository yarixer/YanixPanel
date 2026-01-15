import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (!user.isAdmin) {
      throw new ForbiddenException('Admins only');
    }

    return true;
  }
}
