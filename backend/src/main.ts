import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
 
  const trustProxyIp = process.env.TRUST_PROXY_IP?.trim();

  if (trustProxyIp) {
    app.set('trust proxy', (ip: string) => {
      const normalized = (ip ?? '').replace(/^::ffff:/, '').trim();
      return normalized === trustProxyIp;
    });
  }
  

  app.setGlobalPrefix('api', {
    exclude: ['panel', 'panel/*path'],
  });


  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}
bootstrap();

