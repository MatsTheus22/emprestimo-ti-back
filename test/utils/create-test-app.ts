import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';

export interface TestAppOptions {
  controllers?: Type[];
  // Troca providers reais por dublês (ex.: banco do container, chaves de teste).
  overrides?: { provide: unknown; useValue: unknown }[];
}

// Sobe a app com a mesma configuração de produção (configureApp).
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  for (const { provide, useValue } of options.overrides ?? []) {
    builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
  await app.init();
  return app;
}
