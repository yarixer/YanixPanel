import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { extractIp } from '../../common/utils/ip.util';
import { Request } from 'express';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & { user?: any }>();

    const sessionToken = req.cookies?.['yanix_session'];

    if (!sessionToken) {
      throw new UnauthorizedException('No session');
    }

    const ip = extractIp(req);
    const user = await this.authService.validateSession(sessionToken, ip);

    (req as any).user = user;
    return true;
  }
}
