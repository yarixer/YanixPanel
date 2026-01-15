import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { NatsModule } from '../nats/nats.module';

@Module({
  imports: [PrismaModule, HttpModule, AuthModule, NatsModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
