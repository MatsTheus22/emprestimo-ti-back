import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

const FRONT = 'http://localhost:5173'; // CORS_ORIGIN de test/setup-env.ts

describe('helmet + CORS', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('test_ca_07_resposta_traz_cabecalhos_do_helmet', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('test_ca_07_erro_tambem_traz_cabecalhos_do_helmet', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404 });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('test_ca_07_cors_libera_a_origem_do_front', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').set('Origin', FRONT);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('test_ca_07_cors_preflight_da_origem_do_front_libera_authorization', async () => {
    const res = await request(app.getHttpServer())
      .options('/v1/health')
      .set('Origin', FRONT)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('test_ca_07_cors_recusa_outra_origem', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'https://site-malicioso.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
