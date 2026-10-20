import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../utils/create-test-app';
import { createTestTokens, TestTokens } from '../utils/test-tokens';
import { createTestPrisma } from './test-database';

// Spec 002 CA-02..CA-05: GET /v1/me contra Postgres real, com tokens no
// formato do Supabase Auth.

const TENANT_A = { id: randomUUID(), slug: 'me_a_' + randomUUID(), name: 'Tenant A' };
const TENANT_B = { id: randomUUID(), slug: 'me_b_' + randomUUID(), name: 'Tenant B' };
const ANA = randomUUID(); // colaboradora só no tenant A
const DUPLA = randomUUID(); // membership em A (operacoes) e em B (colaborador)
const SEM_MEMBERSHIP = randomUUID();

let prisma: PrismaService;
let tokens: TestTokens;
let app: INestApplication<App>;

function claimsFor(userId: string, tenantId: string, role: string) {
  return { sub: userId, tenant_id: tenantId, app_role: role };
}

beforeAll(async () => {
  prisma = createTestPrisma();
  tokens = await createTestTokens();
  app = await createTestApp({
    overrides: [{ provide: PrismaService, useValue: prisma }, tokens.keySetOverride],
  });

  for (const id of [ANA, DUPLA, SEM_MEMBERSHIP]) {
    await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  }
  await prisma.tenant.createMany({ data: [TENANT_A, TENANT_B] });
  await prisma.membership.createMany({
    data: [
      { userId: ANA, tenantId: TENANT_A.id, role: 'colaborador', displayName: 'Ana Ribeiro' },
      { userId: DUPLA, tenantId: TENANT_A.id, role: 'operacoes', displayName: 'Dupla em A' },
      { userId: DUPLA, tenantId: TENANT_B.id, role: 'colaborador', displayName: 'Dupla em B' },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

function getMe(token?: string) {
  const req = request(app.getHttpServer()).get('/v1/me');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

describe('GET /v1/me', () => {
  it('test_ca_02_token_valido_devolve_nome_papel_e_tenant', async () => {
    const res = await getMe(await tokens.sign(claimsFor(ANA, TENANT_A.id, 'colaborador')));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: ANA,
      displayName: 'Ana Ribeiro',
      role: 'colaborador',
      tenant: TENANT_A,
    });
  });

  it('test_ca_03_sem_token_responde_401_problem_json', async () => {
    const res = await getMe();

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, title: 'Unauthorized', instance: '/v1/me' });
  });

  it.each([
    [
      'expirado',
      () => tokens.sign(claimsFor(ANA, TENANT_A.id, 'colaborador'), { expiresIn: '-1m' }),
    ],
    [
      'assinado_por_outra_chave',
      () => tokens.signWithForeignKey(claimsFor(ANA, TENANT_A.id, 'colaborador')),
    ],
    [
      'de_outro_emissor',
      () =>
        tokens.sign(claimsFor(ANA, TENANT_A.id, 'colaborador'), {
          issuer: 'https://outro.supabase.co/auth/v1',
        }),
    ],
    ['malformado', () => Promise.resolve('nao.e.jwt')],
  ])('test_ca_03_token_%s_responde_401', async (_caso, makeToken) => {
    const res = await getMe(await makeToken());

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: 401, detail: 'Token inválido ou expirado' });
  });

  it('test_ca_04_token_sem_tenant_responde_403', async () => {
    const res = await getMe(await tokens.sign({ sub: SEM_MEMBERSHIP }));

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({
      status: 403,
      detail: 'Seu usuário não tem acesso. Fale com Operações.',
    });
  });

  it('test_ca_04_membership_removida_depois_do_token_responde_403', async () => {
    // Claim de tenant válido, mas sem membership correspondente no banco.
    const res = await getMe(
      await tokens.sign(claimsFor(SEM_MEMBERSHIP, TENANT_A.id, 'colaborador')),
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403 });
  });

  it('test_ca_05_isolamento_tenant_vem_so_do_token', async () => {
    const tokenB = await tokens.sign(claimsFor(DUPLA, TENANT_B.id, 'colaborador'));

    const res = await getMe(tokenB)
      .query({ tenant_id: TENANT_A.id, tenantId: TENANT_A.id })
      .set('X-Tenant-Id', TENANT_A.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: DUPLA,
      displayName: 'Dupla em B',
      role: 'colaborador',
      tenant: TENANT_B,
    });
  });

  it('test_ca_05_isolamento_usuario_de_b_nao_ve_tenant_a', async () => {
    // Ana só existe em A; um token dela com claim de B não acha nada em B.
    const res = await getMe(await tokens.sign(claimsFor(ANA, TENANT_B.id, 'colaborador')));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(TENANT_A.id);
  });
});

describe('rotas públicas', () => {
  it('test_ca_03_health_continua_publico_sem_token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
