import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadDir = resolve(
    process.cwd(),
    process.env.UPLOAD_DIR ?? '../uploads',
  );

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.APP_ORIGIN?.split(',').map((item) => item.trim()) ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
  });

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
