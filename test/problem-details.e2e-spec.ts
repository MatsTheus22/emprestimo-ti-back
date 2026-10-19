import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Public } from '../src/modules/auth/public.decorator';
import { createTestApp } from './utils/create-test-app';

// Público: aqui só interessa o formato do erro, não a autenticação.
@Public()
@Controller('__test__')
class FailingController {
  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('Sem acesso a este recurso');
  }

  @Get('invalid')
  invalid(): never {
    throw new BadRequestException({ message: 'Entrada inválida', errors: [{ path: 'name' }] });
  }

  @Get('boom')
  boom(): never {
    throw new Error('segredo interno do banco');
  }
}

describe('Problem Details (RFC 9457)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [FailingController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('test_ca_05_rota_inexistente_responde_404_problem_json', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nao-existe?x=1');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/v1/nao-existe',
    });
  });

  it('test_ca_05_erro_http_leva_detail', async () => {
    const res = await request(app.getHttpServer()).get('/v1/__test__/forbidden');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      detail: 'Sem acesso a este recurso',
      instance: '/v1/__test__/forbidden',
    });
  });

  it('test_ca_05_erro_de_validacao_leva_errors', async () => {
    const res = await request(app.getHttpServer()).get('/v1/__test__/invalid');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      detail: 'Entrada inválida',
      errors: [{ path: 'name' }],
    });
  });

  it('test_ca_05_erro_inesperado_responde_500_sem_vazar_detalhe', async () => {
    const res = await request(app.getHttpServer()).get('/v1/__test__/boom');

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/v1/__test__/boom',
    });
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });
});
