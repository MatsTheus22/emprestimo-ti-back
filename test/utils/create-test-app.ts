import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';

// Sobe a app com a mesma configuração de produção (configureApp).
export async function createTestApp(extraControllers: Type[] = []): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();
  const app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
  await app.init();
  return app;
}
