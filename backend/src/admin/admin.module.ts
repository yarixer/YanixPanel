// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HttpModule } from '@nestjs/axios';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [PrismaModule, AuthModule, HttpModule, ServersModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
