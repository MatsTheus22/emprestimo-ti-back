import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Usado pelo bootstrap local (main.ts), pelo handler serverless e pelos
// testes, para que os três configurem a app exatamente do mesmo jeito.
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('v1');
  return app;
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  return configureApp(app);
}
