import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async countUnverifiedByIp(ip: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        registrationIp: ip,
        verified: false,
      },
    });
  }

  async createUser(email: string, passwordHash: string, registrationIp: string | null) {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        registrationIp,
      },
    });
  }

  async getById(id: bigint) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
