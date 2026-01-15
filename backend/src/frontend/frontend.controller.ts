import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'path';
import { AuthService } from '../auth/auth.service';
import { extractIp } from '../common/utils/ip.util';

@Controller()
export class FrontendController {
  constructor(private readonly authService: AuthService) {}

  @Get('panel')
  async panelRoot(@Req() req: Request, @Res() res: Response) {
    return this.servePanel(req, res);
  }

  @Get('panel/*path')
  async panelAny(@Req() req: Request, @Res() res: Response) {
    return this.servePanel(req, res);
  }

  private async servePanel(req: Request, res: Response) {
    const sessionToken = req.cookies?.['yanix_session'];
    if (!sessionToken) {
      return res.redirect('/auth/login');
    }

    try {
      const ip = extractIp(req);
      await this.authService.validateSession(sessionToken, ip);
    } catch {
      return res.redirect('/auth/login');
    }

    return res.sendFile(join(process.cwd(), 'public', '200.html'));
  }
}
