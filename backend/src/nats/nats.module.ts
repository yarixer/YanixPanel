// src/nats/nats.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NatsService } from './nats.service';
import { LogStreamHub } from './log-stream-hub.service';

@Module({
  imports: [ConfigModule],
  providers: [NatsService, LogStreamHub],
  exports: [NatsService, LogStreamHub],
})
export class NatsModule {}
