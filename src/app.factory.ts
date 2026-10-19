import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import type { Env } from './config/env';
import { ENV } from './config/env.module';

// Usado pelo bootstrap local (main.ts), pelo handler serverless e pelos
// testes, para que os três configurem a app exatamente do mesmo jeito.
export function configureApp<T extends INestApplication>(app: T): T {
  const env = app.get<Env>(ENV);

  // ADR-001 §10: cabeçalhos de segurança. §7: CORS só para a origem do front;
  // a sessão vai em header Authorization, não em cookie.
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  return app;
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  return configureApp(app);
}
