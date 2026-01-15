import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { FilesModule } from './files/files.module';
import { AdminModule } from './admin/admin.module';
import { FrontendController } from './frontend/frontend.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000, 
          limit: 100, 
        },
      ],
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['api', 'api/*path', 'panel', 'panel/*path'],
    }),

    PrismaModule,
    HttpModule,
    UsersModule,
    SessionsModule,
    AuthModule,
    ServersModule,
    FilesModule,
    AdminModule,
  ],
  controllers: [AppController, FrontendController],
  providers: [AppService],
})
export class AppModule {}
