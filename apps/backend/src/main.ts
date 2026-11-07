import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureKeepAlive } from './common/http-server.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Do not tell clients which framework runs the API (F-06).
  app.disable('x-powered-by');
  configureKeepAlive(app.getHttpServer());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
