import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(dto: RegisterDto, ip: string | null) {
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Passwords do not match');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('User already exists');
    }

    if (ip) {
      const unverifiedCount = await this.usersService.countUnverifiedByIp(ip);
      if (unverifiedCount >= 1) {
        throw new ForbiddenException('Too many unverified accounts from this IP');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.createUser(dto.email, passwordHash, ip);

    return { id: String(user.id), email: user.email };
  }

  async login(dto: LoginDto, ip: string, userAgent?: string | null) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.verified) {
      throw new ForbiddenException('Account is not verified yet');
    }

    const session = await this.sessionsService.createSession({
      userId: user.id,
      ip,
      userAgent: userAgent ?? null,
      sessionTtlMs: this.SESSION_TTL_MS,
      refreshTtlMs: this.REFRESH_TTL_MS,
    });

    return {
      user: { id: String(user.id), email: user.email, isAdmin: user.isAdmin },
      ...session,
    };
  }

  async validateSession(sessionToken: string, ip: string) {
    const session = await this.sessionsService.findActiveSessionBySessionToken(
      sessionToken,
    );
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.ip !== ip) {
      await this.sessionsService.invalidateSessionById(session.id);
      throw new UnauthorizedException('Session invalidated due to IP change');
    }

    if (!session.user.verified) {
      throw new ForbiddenException('Account is not verified');
    }

    return session.user;
  }

  async refresh(refreshToken: string, ip: string, userAgent?: string | null) {
    const session = await this.sessionsService.findActiveSessionByRefreshToken(
      refreshToken,
    );

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.ip !== ip) {
      await this.sessionsService.invalidateSessionById(session.id);
      throw new UnauthorizedException('Session invalidated due to IP change');
    }

    if (!session.user.verified) {
      throw new ForbiddenException('Account is not verified');
    }

    await this.sessionsService.invalidateSessionById(session.id);

    const newSession = await this.sessionsService.createSession({
      userId: session.userId,
      ip,
      userAgent: userAgent ?? null,
      sessionTtlMs: this.SESSION_TTL_MS,
      refreshTtlMs: this.REFRESH_TTL_MS,
    });

    return {
      user: {
        id: String(session.user.id),
        email: session.user.email,
        isAdmin: session.user.isAdmin,
      },
      ...newSession,
    };
  }
  async logoutAllSessionsForUser(userId: bigint) {
    await this.sessionsService.invalidateAllSessionsForUser(userId);
  }

  
}
