import request from 'supertest';
import { createApp } from '../src/app.factory';
import { createServerlessHandler } from '../src/serverless';

// Spec 001 CA-10: o handler da Vercel responde /v1/health e reaproveita
// a instância Nest entre invocações (bootstrap uma vez).

describe('handler serverless', () => {
  it('test_ca_10_duas_invocacoes_um_bootstrap', async () => {
    const factory = jest.fn(createApp);
    const handler = createServerlessHandler(factory);

    const first = await request(handler).get('/v1/health');
    const second = await request(handler).get('/v1/health');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'ok' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ status: 'ok' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('test_ca_10_invocacoes_simultaneas_no_cold_start_compartilham_o_bootstrap', async () => {
    const factory = jest.fn(createApp);
    const handler = createServerlessHandler(factory);

    const responses = await Promise.all([1, 2, 3].map(() => request(handler).get('/v1/health')));

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('test_ca_10_bootstrap_que_falha_e_tentado_de_novo', async () => {
    const factory = jest
      .fn<ReturnType<typeof createApp>, []>()
      .mockRejectedValueOnce(new Error('cold start falhou'))
      .mockImplementation(createApp);
    const handler = createServerlessHandler(factory);

    await expect(handler({} as never, {} as never)).rejects.toThrow('cold start falhou');
    const res = await request(handler).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
