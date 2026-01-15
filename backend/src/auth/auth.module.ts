import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [PrismaModule, UsersModule, SessionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    AdminGuard,
  ],
  exports: [AuthService, SessionAuthGuard, AdminGuard],
})
export class AuthModule {}
