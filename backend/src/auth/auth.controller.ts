import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { Request, Response } from 'express';
import { extractIp } from '../common/utils/ip.util';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 3,
      ttl: 600_000, // 10 минут
    },
  })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = extractIp(req);
    const user = await this.authService.register(dto, ip);
    return { user };
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000, // 60 секунд
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await this.authService.login(dto, ip, String(userAgent));

    const secure =
      process.env.COOKIE_SECURE === 'true'
        ? true
        : process.env.COOKIE_SECURE === 'false'
          ? false
          : req.secure;


    res.cookie('yanix_session', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('yanix_refresh', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      user: result.user,
    };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  async logout(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Закрываем все сессии этого пользователя в БД
    await this.authService.logoutAllSessionsForUser(user.id as bigint);

    // Чистим куки
    res.clearCookie('yanix_session', { path: '/' });
    res.clearCookie('yanix_refresh', { path: '/' });

    return { ok: true };
  }


  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['yanix_refresh'];
    if (!refreshToken) {
      throw new Error('No refresh token');
    }

    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await this.authService.refresh(
      refreshToken,
      ip,
      String(userAgent),
    );

    const secure =
      process.env.COOKIE_SECURE === 'true'
        ? true
        : process.env.COOKIE_SECURE === 'false'
          ? false
          : req.secure;

    res.cookie('yanix_session', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('yanix_refresh', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { user: result.user };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() user: any) {
    return {
      id: String(user.id),
      email: user.email,
      isAdmin: user.isAdmin,
    };
  }
}
