import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(params: {
    userId: bigint;
    ip: string;
    userAgent?: string | null;
    sessionTtlMs: number;
    refreshTtlMs: number;
  }) {
    const sessionToken = this.generateToken();
    const refreshToken = this.generateToken();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.sessionTtlMs);
    const refreshExpiresAt = new Date(now.getTime() + params.refreshTtlMs);

    await this.prisma.session.create({
      data: {
        userId: params.userId,
        sessionTokenHash: this.hashToken(sessionToken),
        refreshTokenHash: this.hashToken(refreshToken),
        ip: params.ip,
        userAgent: params.userAgent ?? null,
        expiresAt,
        refreshExpiresAt,
        isActive: true,
      },
    });

    return { sessionToken, refreshToken, expiresAt, refreshExpiresAt };
  }
 
  async invalidateAllSessionsForUser(userId: bigint) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
  }

  
  async findActiveSessionBySessionToken(token: string) {
    const hash = this.hashToken(token);
    const now = new Date();
    return this.prisma.session.findFirst({
      where: {
        sessionTokenHash: hash,
        isActive: true,
        expiresAt: { gt: now },
      },
      include: { user: true },
    });
  }

  async findActiveSessionByRefreshToken(token: string) {
    const hash = this.hashToken(token);
    const now = new Date();
    return this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hash,
        isActive: true,
        refreshExpiresAt: { gt: now },
      },
      include: { user: true },
    });
  }

  async invalidateSessionById(id: bigint) {
    await this.prisma.session.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
