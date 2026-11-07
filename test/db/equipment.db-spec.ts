import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../utils/create-test-app';
import { createTestTokens, TestTokens } from '../utils/test-tokens';
import { createTestPrisma } from './test-database';

// Spec 004 CA-05 e CA-06: GET /v1/equipment contra Postgres real.

const TENANT = { id: randomUUID(), slug: 'equip_a_' + randomUUID(), name: 'Tenant A' };
const OUTRO_TENANT = { id: randomUUID(), slug: 'equip_b_' + randomUUID(), name: 'Tenant B' };
const ANA = randomUUID();
const BRUNO = randomUUID();
const CARLA = randomUUID(); // só no outro tenant
const SEM_MEMBERSHIP = randomUUID();

const DEVOLUCAO_ANA = new Date('2031-03-10T02:59:59.999Z');
const DEVOLUCAO_BRUNO = new Date('2031-04-20T02:59:59.999Z');

let prisma: PrismaService;
let tokens: TestTokens;
let app: INestApplication<App>;
let emprestimoBruno: string;

function tokenDe(userId: string, tenantId: string = TENANT.id, role = 'colaborador') {
  return tokens.sign({ sub: userId, tenant_id: tenantId, app_role: role });
}

async function listar(token?: string, query: Record<string, string | number> = {}) {
  const req = request(app.getHttpServer()).get('/v1/equipment').query(query);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

interface Item {
  assetTag: string;
  status: string;
  myLoan: { dueAt: string } | null;
}

function porPatrimonio(items: Item[], assetTag: string): Item {
  const item = items.find((candidato) => candidato.assetTag === assetTag);
  if (!item) throw new Error(`${assetTag} não veio na resposta`);
  return item;
}

beforeAll(async () => {
  prisma = createTestPrisma();
  tokens = await createTestTokens();
  app = await createTestApp({
    overrides: [{ provide: PrismaService, useValue: prisma }, tokens.keySetOverride],
  });

  for (const id of [ANA, BRUNO, CARLA, SEM_MEMBERSHIP]) {
    await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  }
  await prisma.tenant.createMany({ data: [TENANT, OUTRO_TENANT] });
  await prisma.membership.createMany({
    data: [
      { userId: ANA, tenantId: TENANT.id, role: 'colaborador', displayName: 'Ana Ribeiro' },
      { userId: BRUNO, tenantId: TENANT.id, role: 'operacoes', displayName: 'Bruno Pessoa' },
      { userId: CARLA, tenantId: OUTRO_TENANT.id, role: 'colaborador', displayName: 'Carla' },
    ],
  });

  const base = { tenantId: TENANT.id, category: 'notebook', photoAuthor: 'Autor da foto' };
  await prisma.equipment.createMany({
    data: [
      {
        ...base,
        assetTag: 'TI-0001',
        name: 'Notebook 14',
        status: 'disponivel',
        imagePath: 'TI-0001.jpg',
      },
      { ...base, assetTag: 'TI-0002', name: 'Notebook 15', status: 'manutencao' },
      { ...base, assetTag: 'TI-0003', name: 'Com a Ana', status: 'emprestado' },
      { ...base, assetTag: 'TI-0004', name: 'Com o Bruno', status: 'emprestado' },
      { ...base, assetTag: 'TI-0005', name: 'Devolvido pela Ana', status: 'disponivel' },
      {
        tenantId: OUTRO_TENANT.id,
        category: 'camera',
        assetTag: 'TI-9999',
        name: 'Câmera de outro tenant',
        status: 'disponivel',
      },
    ],
  });

  const idDe = async (assetTag: string) =>
    (
      await prisma.equipment.findFirstOrThrow({
        where: { tenantId: TENANT.id, assetTag },
      })
    ).id;

  await prisma.loan.create({
    data: {
      tenantId: TENANT.id,
      userId: ANA,
      equipmentId: await idDe('TI-0003'),
      dueAt: DEVOLUCAO_ANA,
    },
  });
  emprestimoBruno = (
    await prisma.loan.create({
      data: {
        tenantId: TENANT.id,
        userId: BRUNO,
        equipmentId: await idDe('TI-0004'),
        dueAt: DEVOLUCAO_BRUNO,
      },
    })
  ).id;
  await prisma.loan.create({
    data: {
      tenantId: TENANT.id,
      userId: ANA,
      equipmentId: await idDe('TI-0005'),
      dueAt: DEVOLUCAO_ANA,
      returnedAt: new Date('2031-01-01T00:00:00.000Z'),
    },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /v1/equipment', () => {
  it('test_ca_05_devolve_os_equipamentos_do_tenant_com_os_campos_e_os_totais', async () => {
    const res = await listar(await tokenDe(ANA));

    expect(res.status).toBe(200);
    const body = res.body as { items: (Item & { id: string })[] };
    expect(body.items.map((item) => item.assetTag)).toEqual([
      'TI-0001',
      'TI-0002',
      'TI-0003',
      'TI-0004',
      'TI-0005',
    ]);
    expect(body.items[0]).toEqual({
      id: expect.any(String) as string,
      assetTag: 'TI-0001',
      name: 'Notebook 14',
      category: 'notebook',
      status: 'disponivel',
      imagePath: 'TI-0001.jpg',
      myLoan: null,
    });
    expect(res.body).toMatchObject({ nextCursor: null, totals: { total: 5, available: 2 } });
  });

  it('test_ca_05_equipamento_sem_imagem_vem_com_caminho_nulo', async () => {
    const res = await listar(await tokenDe(ANA));

    expect((res.body as { items: unknown[] }).items[1]).toMatchObject({
      assetTag: 'TI-0002',
      imagePath: null,
    });
  });

  it('test_ca_05_cursor_percorre_as_paginas_sem_repetir_nem_pular', async () => {
    const token = await tokenDe(ANA);
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;

    do {
      const query: Record<string, string | number> = { limit: 2, ...(cursor ? { cursor } : {}) };
      const res = await listar(token, query);
      const body = res.body as {
        items: Item[];
        nextCursor: string | null;
        totals: { total: number };
      };

      expect(res.status).toBe(200);
      expect(body.totals.total).toBe(5);
      vistos.push(...body.items.map((item) => item.assetTag));
      cursor = body.nextCursor;
      paginas++;
    } while (cursor);

    expect(paginas).toBe(3);
    expect(vistos).toEqual(['TI-0001', 'TI-0002', 'TI-0003', 'TI-0004', 'TI-0005']);
  });

  it('test_ca_05_ultima_pagina_exata_nao_devolve_cursor', async () => {
    const res = await listar(await tokenDe(ANA), { limit: 5 });

    expect((res.body as { items: unknown[] }).items).toHaveLength(5);
    expect(res.body).toMatchObject({ nextCursor: null });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 'abc' }, { cursor: '' }])(
    'test_ca_05_parametro_invalido_responde_400_problem_json_%j',
    async (query) => {
      const res = await listar(await tokenDe(ANA), query);

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 400, instance: '/v1/equipment' });
    },
  );

  it('test_ca_05_sem_token_responde_401_problem_json', async () => {
    const res = await listar();

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, instance: '/v1/equipment' });
  });

  it('test_ca_05_token_sem_tenant_responde_403', async () => {
    const res = await listar(await tokens.sign({ sub: SEM_MEMBERSHIP }));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      detail: 'Seu usuário não tem acesso. Fale com Operações.',
    });
  });

  it('test_ca_05_sem_membership_no_tenant_do_token_responde_403_sem_dados', async () => {
    const res = await listar(await tokenDe(SEM_MEMBERSHIP));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('TI-0001');
  });

  it('test_ca_05_isolamento_tenant_de_outro_nao_aparece', async () => {
    const res = await listar(await tokenDe(ANA));

    expect(JSON.stringify(res.body)).not.toContain('TI-9999');
  });

  it('test_ca_05_isolamento_tenant_vem_so_do_token', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/equipment')
      .query({ tenant_id: OUTRO_TENANT.id, tenantId: OUTRO_TENANT.id })
      .set('X-Tenant-Id', OUTRO_TENANT.id)
      .set('Authorization', `Bearer ${await tokenDe(CARLA, OUTRO_TENANT.id)}`);

    const body = res.body as { items: Item[]; totals: { total: number } };
    expect(res.status).toBe(200);
    expect(body.items.map((item) => item.assetTag)).toEqual(['TI-9999']);
    expect(body.totals.total).toBe(1);

    const daAna = await request(app.getHttpServer())
      .get('/v1/equipment')
      .query({ tenant_id: OUTRO_TENANT.id, tenantId: OUTRO_TENANT.id })
      .set('X-Tenant-Id', OUTRO_TENANT.id)
      .set('Authorization', `Bearer ${await tokenDe(ANA)}`);

    expect(JSON.stringify(daAna.body)).not.toContain('TI-9999');
  });

  it('test_ca_05_isolamento_token_de_outro_tenant_sem_membership_la_responde_403', async () => {
    const res = await listar(await tokenDe(ANA, OUTRO_TENANT.id));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('TI-9999');
  });
});

describe('privacidade do empréstimo', () => {
  it('test_ca_06_item_com_outra_pessoa_traz_so_a_situacao', async () => {
    const res = await listar(await tokenDe(ANA));
    const item = porPatrimonio((res.body as { items: Item[] }).items, 'TI-0004');

    expect(item.status).toBe('emprestado');
    expect(item.myLoan).toBeNull();
    expect(Object.keys(item).sort()).toEqual([
      'assetTag',
      'category',
      'id',
      'imagePath',
      'myLoan',
      'name',
      'status',
    ]);
  });

  it('test_ca_06_corpo_nao_contem_id_nome_nem_data_do_emprestimo_de_outra_pessoa', async () => {
    const res = await listar(await tokenDe(ANA));
    const corpo = JSON.stringify(res.body);

    expect(corpo).not.toContain(BRUNO);
    expect(corpo).not.toContain('Bruno Pessoa');
    expect(corpo).not.toContain(emprestimoBruno);
    expect(corpo).not.toContain(DEVOLUCAO_BRUNO.toISOString());
  });

  it('test_ca_06_item_com_a_propria_pessoa_traz_a_data_de_devolucao', async () => {
    const res = await listar(await tokenDe(ANA));
    const item = porPatrimonio((res.body as { items: Item[] }).items, 'TI-0003');

    expect(item.status).toBe('emprestado');
    expect(item.myLoan).toEqual({ dueAt: DEVOLUCAO_ANA.toISOString() });
  });

  it('test_ca_06_quem_tem_o_item_nao_ve_o_item_do_outro_e_vice_versa', async () => {
    const res = await listar(await tokenDe(BRUNO, TENANT.id, 'operacoes'));
    const { items } = res.body as { items: Item[] };

    expect(porPatrimonio(items, 'TI-0004').myLoan).toEqual({
      dueAt: DEVOLUCAO_BRUNO.toISOString(),
    });
    expect(porPatrimonio(items, 'TI-0003').myLoan).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(ANA);
  });

  it('test_ca_06_emprestimo_ja_devolvido_nao_conta_como_meu', async () => {
    const res = await listar(await tokenDe(ANA));
    const item = porPatrimonio((res.body as { items: Item[] }).items, 'TI-0005');

    expect(item.status).toBe('disponivel');
    expect(item.myLoan).toBeNull();
  });

  it('test_ca_06_operacoes_tambem_nao_ve_com_quem_esta_o_item_de_outra_pessoa', async () => {
    const res = await listar(await tokenDe(BRUNO, TENANT.id, 'operacoes'));
    const corpo = JSON.stringify(res.body);

    expect(corpo).not.toContain('Ana Ribeiro');
    expect(corpo).not.toContain(DEVOLUCAO_ANA.toISOString());
  });
});

describe('créditos da foto', () => {
  it('test_ca_05_creditos_da_foto_nao_saem_na_resposta', async () => {
    const res = await listar(await tokenDe(ANA));

    expect(JSON.stringify(res.body)).not.toContain('Autor da foto');
  });
});
