import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../utils/create-test-app';
import { createTestTokens, TestTokens } from '../utils/test-tokens';
import { createTestPrisma } from './test-database';

// Spec 004 CA-15: GET /v1/loans/me contra Postgres real.

const TENANT = randomUUID();
const OUTRO_TENANT = randomUUID();

const FUTURO = new Date('2099-01-01T02:59:59.999Z');
const PASSADO = new Date('2020-01-01T02:59:59.999Z');

let prisma: PrismaService;
let tokens: TestTokens;
let app: INestApplication<App>;

interface Item {
  id: string;
  dueAt: string;
  overdue: boolean;
  equipment: { assetTag: string };
}
interface Lista {
  items: Item[];
  nextCursor: string | null;
  totals: { open: number; overdue: number };
}

async function novaPessoa(tenantIds: string[] = [TENANT]): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  for (const tenantId of tenantIds) {
    await prisma.membership.create({ data: { userId: id, tenantId, role: 'colaborador' } });
  }
  return id;
}

async function emprestimo(
  userId: string,
  opcoes: {
    dueAt?: Date;
    borrowedAt?: Date;
    returnedAt?: Date;
    tenantId?: string;
    assetTag?: string;
  } = {},
) {
  const { tenantId = TENANT, dueAt = FUTURO, borrowedAt, returnedAt, assetTag } = opcoes;
  const equipamento = await prisma.equipment.create({
    data: {
      tenantId,
      category: 'monitor',
      name: 'Monitor',
      assetTag: assetTag ?? randomUUID(),
      status: returnedAt ? 'disponivel' : 'emprestado',
    },
  });
  return prisma.loan.create({
    data: {
      tenantId,
      userId,
      equipmentId: equipamento.id,
      dueAt,
      ...(borrowedAt ? { borrowedAt } : {}),
      ...(returnedAt ? { returnedAt } : {}),
    },
  });
}

function tokenDe(userId: string, tenantId: string = TENANT) {
  return tokens.sign({ sub: userId, tenant_id: tenantId, app_role: 'colaborador' });
}

async function meus(token?: string, query: Record<string, string | number> = {}) {
  const req = request(app.getHttpServer()).get('/v1/loans/me').query(query);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

beforeAll(async () => {
  prisma = createTestPrisma();
  tokens = await createTestTokens();
  app = await createTestApp({
    overrides: [{ provide: PrismaService, useValue: prisma }, tokens.keySetOverride],
  });
  await prisma.tenant.createMany({
    data: [
      { id: TENANT, slug: 'meus_' + TENANT, name: 'Meus' },
      { id: OUTRO_TENANT, slug: 'meus_' + OUTRO_TENANT, name: 'Outro' },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /v1/loans/me', () => {
  it('test_ca_15_devolve_o_emprestimo_aberto_com_equipamento_retirada_e_devolucao', async () => {
    const pessoa = await novaPessoa();
    const retirada = new Date('2031-02-10T15:00:00.000Z');
    const loan = await emprestimo(pessoa, { borrowedAt: retirada, assetTag: `TI-${pessoa}` });

    const res = await meus(await tokenDe(pessoa));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: loan.id,
          equipment: {
            id: loan.equipmentId,
            assetTag: `TI-${pessoa}`,
            name: 'Monitor',
            category: 'monitor',
          },
          borrowedAt: retirada.toISOString(),
          dueAt: FUTURO.toISOString(),
          overdue: false,
        },
      ],
      nextCursor: null,
      totals: { open: 1, overdue: 0 },
    });
  });

  it('test_ca_15_sem_emprestimos_devolve_lista_vazia_e_totais_zerados', async () => {
    const res = await meus(await tokenDe(await novaPessoa()));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null, totals: { open: 0, overdue: 0 } });
  });

  it('test_ca_15_emprestimo_devolvido_nao_aparece_nem_conta', async () => {
    const pessoa = await novaPessoa();
    await emprestimo(pessoa, { dueAt: PASSADO, returnedAt: PASSADO });

    const res = await meus(await tokenDe(pessoa));

    expect(res.body).toEqual({ items: [], nextCursor: null, totals: { open: 0, overdue: 0 } });
  });

  it('test_ca_15_marca_o_que_esta_em_atraso', async () => {
    const pessoa = await novaPessoa();
    const atrasado = await emprestimo(pessoa, { dueAt: PASSADO });
    const emDia = await emprestimo(pessoa, { dueAt: new Date(Date.now() + 60_000) });

    const res = await meus(await tokenDe(pessoa));
    const body = res.body as Lista;

    expect(body.items.find((item) => item.id === atrasado.id)?.overdue).toBe(true);
    expect(body.items.find((item) => item.id === emDia.id)?.overdue).toBe(false);
    expect(body.totals).toEqual({ open: 2, overdue: 1 });
  });

  it('test_ca_15_ordena_por_retirada', async () => {
    const pessoa = await novaPessoa();
    const depois = await emprestimo(pessoa, { borrowedAt: new Date('2031-03-02T12:00:00Z') });
    const antes = await emprestimo(pessoa, { borrowedAt: new Date('2031-03-01T12:00:00Z') });

    const res = await meus(await tokenDe(pessoa));

    expect((res.body as Lista).items.map((item) => item.id)).toEqual([antes.id, depois.id]);
  });

  it('test_ca_15_cursor_percorre_as_paginas_sem_repetir_nem_pular', async () => {
    const pessoa = await novaPessoa();
    const ids: string[] = [];
    for (let dia = 1; dia <= 3; dia++) {
      const borrowedAt = new Date(`2031-04-0${dia}T12:00:00Z`);
      ids.push((await emprestimo(pessoa, { borrowedAt })).id);
    }
    const token = await tokenDe(pessoa);

    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const query: Record<string, string | number> = { limit: 1, ...(cursor ? { cursor } : {}) };
      const body = (await meus(token, query)).body as Lista;
      expect(body.totals.open).toBe(3);
      vistos.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      paginas++;
    } while (cursor);

    expect(paginas).toBe(3);
    expect(vistos).toEqual(ids);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { cursor: 'nao-e-uuid' }])(
    'test_ca_15_parametro_invalido_responde_400_problem_json_%j',
    async (query) => {
      const res = await meus(await tokenDe(await novaPessoa()), query);

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 400, instance: '/v1/loans/me' });
    },
  );

  it('test_ca_15_sem_token_responde_401_problem_json', async () => {
    const res = await meus();

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, instance: '/v1/loans/me' });
  });

  it('test_ca_15_token_sem_tenant_responde_403', async () => {
    const res = await meus(await tokens.sign({ sub: randomUUID() }));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403 });
  });

  it('test_ca_15_membership_removida_responde_403_sem_dados', async () => {
    const pessoa = await novaPessoa([]);
    const loan = await emprestimo(pessoa);

    const res = await meus(await tokenDe(pessoa));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      detail: 'Seu usuário não tem acesso. Fale com Operações.',
    });
    expect(JSON.stringify(res.body)).not.toContain(loan.id);
  });
});

describe('isolamento', () => {
  it('test_ca_15_emprestimo_de_outra_pessoa_nao_retorna', async () => {
    const dona = await novaPessoa();
    const loan = await emprestimo(dona);
    const outra = await novaPessoa();

    const res = await meus(await tokenDe(outra));

    expect(res.body).toEqual({ items: [], nextCursor: null, totals: { open: 0, overdue: 0 } });
    expect(JSON.stringify(res.body)).not.toContain(loan.id);
  });

  it('test_ca_15_cursor_de_emprestimo_alheio_nao_revela_o_dele', async () => {
    const dona = await novaPessoa();
    const alheio = await emprestimo(dona);
    const outra = await novaPessoa();
    const proprio = await emprestimo(outra);

    const res = await meus(await tokenDe(outra), { cursor: alheio.id });

    expect(res.status).toBe(200);
    const corpo = JSON.stringify(res.body);
    expect(corpo).not.toContain(alheio.id);
    expect(corpo).not.toContain(alheio.equipmentId);
    expect(corpo).not.toContain(dona);
    for (const item of (res.body as Lista).items) expect(item.id).toBe(proprio.id);
  });

  it('test_ca_15_isolamento_token_de_outro_tenant_nao_ve_o_emprestimo_de_la', async () => {
    const pessoa = await novaPessoa([TENANT, OUTRO_TENANT]);
    const aqui = await emprestimo(pessoa);
    const la = await emprestimo(pessoa, { tenantId: OUTRO_TENANT });

    const res = await meus(await tokenDe(pessoa, OUTRO_TENANT));

    expect((res.body as Lista).items.map((item) => item.id)).toEqual([la.id]);
    expect((res.body as Lista).totals.open).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(aqui.id);
  });

  it('test_ca_15_isolamento_tenant_vem_so_do_token', async () => {
    const pessoa = await novaPessoa([TENANT, OUTRO_TENANT]);
    const aqui = await emprestimo(pessoa);
    const la = await emprestimo(pessoa, { tenantId: OUTRO_TENANT });

    const res = await request(app.getHttpServer())
      .get('/v1/loans/me')
      .query({ tenant_id: OUTRO_TENANT, tenantId: OUTRO_TENANT, user_id: randomUUID() })
      .set('X-Tenant-Id', OUTRO_TENANT)
      .set('Authorization', `Bearer ${await tokenDe(pessoa)}`);

    expect((res.body as Lista).items.map((item) => item.id)).toEqual([aqui.id]);
    expect(JSON.stringify(res.body)).not.toContain(la.id);
  });

  it('test_ca_15_isolamento_token_de_tenant_sem_membership_responde_403', async () => {
    const pessoa = await novaPessoa();
    await emprestimo(pessoa);

    const res = await meus(await tokenDe(pessoa, OUTRO_TENANT));

    expect(res.status).toBe(403);
  });
});
