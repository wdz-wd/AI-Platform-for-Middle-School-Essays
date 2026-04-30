import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { resolveUploadDir } from './common/paths';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadDir = resolveUploadDir(process.env.UPLOAD_DIR);

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
