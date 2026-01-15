import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set in environment variables');
    }

    const connectionUrl = new URL(url);

    const adapter = new PrismaMariaDb({
      host: connectionUrl.hostname,
      port: Number(connectionUrl.port) || 3306,
      user: decodeURIComponent(connectionUrl.username),
      password: decodeURIComponent(connectionUrl.password ?? ''),
      database: connectionUrl.pathname.slice(1),
      // можно добавить connectionLimit и др. поля при необходимости
    });

    // Prisma 7: обязательно передаём adapter
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
