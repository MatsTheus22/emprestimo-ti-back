import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { API_PREFIX } from './app.factory';
import { AppModule } from './app.module';

// ADR-001 §4: o contrato sai dos schemas Zod do Nest. Modo `preview` monta
// as rotas sem instanciar providers — não precisa de banco nem de .env.
export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.setGlobalPrefix(API_PREFIX);

  const config = new DocumentBuilder()
    .setTitle('EMPREST.AI API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  await app.close();
  return document;
}

// Texto estável (mesma ordem, newline final) para o diff do PR mostrar só
// mudança real de contrato.
export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return JSON.stringify(document, null, 2) + '\n';
}
