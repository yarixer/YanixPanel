import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { ServersModule } from '../servers/servers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, HttpModule, ServersModule, AuthModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
