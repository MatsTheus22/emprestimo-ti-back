import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { devolucaoSql, LoansRepository } from '../../src/modules/loans/loans.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../utils/create-test-app';
import { createTestTokens, TestTokens } from '../utils/test-tokens';
import { createTestPrisma } from './test-database';

// Spec 004 CA-08 a CA-12 e CA-14: POST /v1/loans contra Postgres real.

const TENANT = randomUUID();
const OUTRO_TENANT = randomUUID();

const TIPO_INDISPONIVEL = 'urn:emprestai:erro:equipamento-indisponivel';
const TIPO_LIMITE = 'urn:emprestai:erro:limite-emprestimos';
const TIPO_ATRASO = 'urn:emprestai:erro:emprestimo-em-atraso';

const PASSADO = new Date('2020-01-01T00:00:00.000Z');
const FUTURO = new Date('2099-01-01T00:00:00.000Z');

let prisma: PrismaService;
let tokens: TestTokens;
let app: INestApplication<App>;

async function novaPessoa(tenantId: string = TENANT, role = 'colaborador'): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  await prisma.membership.create({ data: { userId: id, tenantId, role } });
  return id;
}

async function novoEquipamento(status = 'disponivel', tenantId: string = TENANT): Promise<string> {
  const { id } = await prisma.equipment.create({
    data: { tenantId, category: 'notebook', name: 'Notebook', assetTag: randomUUID(), status },
  });
  return id;
}

// Empréstimo que já existe: o equipamento fica `emprestado`, como a API deixaria.
async function emprestimoAberto(userId: string, dueAt: Date = FUTURO): Promise<string> {
  const equipmentId = await novoEquipamento('emprestado');
  await prisma.loan.create({ data: { tenantId: TENANT, equipmentId, userId, dueAt } });
  return equipmentId;
}

function tokenDe(userId: string, tenantId: string = TENANT, role = 'colaborador') {
  return tokens.sign({ sub: userId, tenant_id: tenantId, app_role: role });
}

async function solicitar(
  userId: string,
  equipmentId: string,
  alvo: INestApplication<App> = app,
  corpoExtra: object = {},
) {
  return request(alvo.getHttpServer())
    .post('/v1/loans')
    .set('Authorization', `Bearer ${await tokenDe(userId)}`)
    .send({ equipmentId, ...corpoExtra });
}

async function situacao(equipmentId: string): Promise<string> {
  const { status } = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  return status;
}

function emprestimosDo(equipmentId: string): Promise<number> {
  return prisma.loan.count({ where: { equipmentId } });
}

function auditoriaDe(userId: string): Promise<number> {
  return prisma.auditLog.count({ where: { actorId: userId } });
}

async function esperarRecusaSemEfeito(
  res: request.Response,
  tipo: string,
  userId: string,
  equipmentId: string,
  statusEsperado: string,
  emprestimosEsperados = 0,
) {
  expect(res.status).toBe(409);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({ type: tipo, status: 409, instance: '/v1/loans' });
  expect(typeof (res.body as { detail?: unknown }).detail).toBe('string');
  expect(await situacao(equipmentId)).toBe(statusEsperado);
  expect(await emprestimosDo(equipmentId)).toBe(emprestimosEsperados);
  expect(await auditoriaDe(userId)).toBe(0);
}

beforeAll(async () => {
  prisma = createTestPrisma();
  tokens = await createTestTokens();
  app = await createTestApp({
    overrides: [{ provide: PrismaService, useValue: prisma }, tokens.keySetOverride],
  });
  await prisma.tenant.createMany({
    data: [
      { id: TENANT, slug: 'solicitar_' + TENANT, name: 'Solicitar' },
      { id: OUTRO_TENANT, slug: 'solicitar_' + OUTRO_TENANT, name: 'Outro' },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('solicitar um equipamento disponível', () => {
  it('test_ca_08_responde_201_cria_o_emprestimo_e_tira_do_disponivel', async () => {
    const pessoa = await novaPessoa();
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento);

    expect(res.status).toBe(201);
    const body = res.body as { id: string; borrowedAt: string; dueAt: string };
    expect(res.body).toEqual({
      id: expect.any(String) as string,
      borrowedAt: expect.any(String) as string,
      dueAt: expect.any(String) as string,
      equipment: {
        id: equipamento,
        assetTag: expect.any(String) as string,
        name: 'Notebook',
        category: 'notebook',
      },
    });

    const emprestimo = await prisma.loan.findUniqueOrThrow({ where: { id: body.id } });
    expect(emprestimo).toMatchObject({
      tenantId: TENANT,
      equipmentId: equipamento,
      userId: pessoa,
      returnedAt: null,
    });
    expect(emprestimo.dueAt.toISOString()).toBe(body.dueAt);
    expect(await situacao(equipamento)).toBe('emprestado');
  });

  it('test_ca_08_devolucao_e_o_fim_do_14o_dia_corrido_em_sao_paulo', async () => {
    const res = await solicitar(await novaPessoa(), await novoEquipamento());
    const { dueAt, borrowedAt } = res.body as { dueAt: string; borrowedAt: string };

    const noFuso = (instante: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(instante);
    const hoje = noFuso(new Date(borrowedAt)).slice(0, 10);
    const esperado = new Date(`${hoje}T12:00:00Z`);
    esperado.setUTCDate(esperado.getUTCDate() + 14);

    expect(noFuso(new Date(dueAt))).toBe(`${esperado.toISOString().slice(0, 10)}, 23:59:59`);
    expect(dueAt).toMatch(/\.999Z$/);
  });

  it('test_ca_08_grava_loan_create_em_audit_log', async () => {
    const pessoa = await novaPessoa();
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento);

    const registros = await prisma.auditLog.findMany({ where: { actorId: pessoa } });
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      tenantId: TENANT,
      action: 'loan.create',
      resource: 'loan',
      resourceId: (res.body as { id: string }).id,
      metadata: { equipmentId: equipamento },
    });
  });

  it('test_ca_08_operacoes_tambem_solicita', async () => {
    const pessoa = await novaPessoa(TENANT, 'operacoes');
    const equipamento = await novoEquipamento();

    const res = await request(app.getHttpServer())
      .post('/v1/loans')
      .set('Authorization', `Bearer ${await tokenDe(pessoa, TENANT, 'operacoes')}`)
      .send({ equipmentId: equipamento });

    expect(res.status).toBe(201);
    expect(await situacao(equipamento)).toBe('emprestado');
  });
});

describe('cálculo da devolução', () => {
  const CASOS = [
    // Meio-dia em São Paulo.
    ['2026-11-06T15:00:00.000Z', '2026-11-21T02:59:59.999Z'],
    // 22h em São Paulo: em UTC já é o dia seguinte, mas o "hoje" ainda é dia 6.
    ['2026-11-07T01:00:00.000Z', '2026-11-21T02:59:59.999Z'],
    // Meia-noite em São Paulo: agora sim é dia 7.
    ['2026-11-07T03:00:00.000Z', '2026-11-22T02:59:59.999Z'],
    // Atravessa a virada do ano.
    ['2026-12-25T12:00:00.000Z', '2027-01-09T02:59:59.999Z'],
  ] as const;

  describe.each(['UTC', 'America/New_York', 'Asia/Tokyo'])('sessão em %s', (fuso) => {
    it.each(CASOS)(
      `test_ca_08_devolucao_com_sessao_em_${fuso}_para_%s`,
      async (instante, esperado) => {
        const repositorio = new LoansRepository(prisma);

        const devolucao = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`set local time zone '${fuso}'`);
          return repositorio.calcularDevolucao(tx, new Date(instante));
        });

        expect(devolucao.toISOString()).toBe(esperado);
      },
    );

    // A coluna é TIMESTAMP(3) sem fuso: atribuir a fórmula direto nela é o caminho em
    // que a sessão desloca o valor se faltar o `at time zone 'UTC'`.
    it.each(CASOS)(
      `test_ca_08_formula_gravada_na_coluna_com_sessao_em_${fuso}_para_%s`,
      async (instante, esperado) => {
        const dono = await novaPessoa();
        const equipmentId = await novoEquipamento('emprestado');
        const { id } = await prisma.loan.create({
          data: { tenantId: TENANT, equipmentId, userId: dono },
        });

        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`set local time zone '${fuso}'`);
          await tx.$executeRaw`
            update loans set due_at = ${devolucaoSql(new Date(instante))} where id = ${id}::uuid`;
        });

        const gravado = await prisma.loan.findUniqueOrThrow({ where: { id } });
        expect(gravado.dueAt.toISOString()).toBe(esperado);
      },
    );
  });

  it('test_ca_08_post_com_a_sessao_em_outro_fuso_grava_a_mesma_devolucao', async () => {
    const emOutroFuso = createTestPrisma('options=-c%20timezone%3DAmerica%2FNew_York');
    const appOutroFuso = await createTestApp({
      overrides: [{ provide: PrismaService, useValue: emOutroFuso }, tokens.keySetOverride],
    });
    try {
      // Sem isto o teste seria vazio: a sessão precisa estar mesmo em outro fuso.
      const [sessao] = await emOutroFuso.$queryRaw<{ fuso: string }[]>`
        select current_setting('timezone') as fuso`;
      expect(sessao?.fuso).toBe('America/New_York');

      const equipamento = await novoEquipamento();
      const antes = Date.now();
      const res = await solicitar(await novaPessoa(), equipamento, appOutroFuso);
      const { id, dueAt, borrowedAt } = res.body as {
        id: string;
        dueAt: string;
        borrowedAt: string;
      };

      expect(res.status).toBe(201);
      expect(dueAt).toMatch(/T02:59:59\.999Z$/);
      // A retirada também não pode sair deslocada pelo fuso da sessão.
      expect(new Date(borrowedAt).getTime()).toBeGreaterThanOrEqual(antes - 5_000);
      expect(new Date(borrowedAt).getTime()).toBeLessThanOrEqual(Date.now() + 5_000);

      // O que ficou gravado, lido por outra sessão, é o mesmo instante.
      const gravado = await prisma.loan.findUniqueOrThrow({ where: { id } });
      expect(gravado.dueAt.toISOString()).toBe(dueAt);
    } finally {
      await appOutroFuso.close();
      await emOutroFuso.$disconnect();
    }
  });
});

describe('situação do equipamento', () => {
  it('test_ca_09_em_manutencao_e_recusado_e_nada_e_criado', async () => {
    const pessoa = await novaPessoa();
    const equipamento = await novoEquipamento('manutencao');

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_INDISPONIVEL, pessoa, equipamento, 'manutencao');
  });

  it('test_ca_09_emprestado_e_recusado_e_nada_e_criado', async () => {
    const dono = await novaPessoa();
    const equipamento = await emprestimoAberto(dono);
    const pessoa = await novaPessoa();

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_INDISPONIVEL, pessoa, equipamento, 'emprestado', 1);
    expect(JSON.stringify(res.body)).not.toContain(dono);
  });

  it('test_ca_09_status_divergente_com_emprestimo_aberto_e_barrado_pelo_indice', async () => {
    // Situação gravada `disponivel`, mas já existe empréstimo aberto: o índice segura.
    const dono = await novaPessoa();
    const equipamento = await novoEquipamento();
    await prisma.loan.create({
      data: { tenantId: TENANT, equipmentId: equipamento, userId: dono, dueAt: FUTURO },
    });
    const pessoa = await novaPessoa();

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_INDISPONIVEL, pessoa, equipamento, 'disponivel', 1);
  });
});

describe('limite de 3 em aberto', () => {
  it('test_ca_10_com_3_em_aberto_e_recusado_e_nada_e_criado', async () => {
    const pessoa = await novaPessoa();
    for (let i = 0; i < 3; i++) await emprestimoAberto(pessoa);
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_LIMITE, pessoa, equipamento, 'disponivel');
    expect(await prisma.loan.count({ where: { userId: pessoa } })).toBe(3);
  });

  it('test_ca_10_com_2_em_aberto_ainda_solicita', async () => {
    const pessoa = await novaPessoa();
    for (let i = 0; i < 2; i++) await emprestimoAberto(pessoa);

    const res = await solicitar(pessoa, await novoEquipamento());

    expect(res.status).toBe(201);
  });

  it('test_ca_10_emprestimo_devolvido_nao_conta_para_o_limite', async () => {
    const pessoa = await novaPessoa();
    for (let i = 0; i < 2; i++) await emprestimoAberto(pessoa);
    await prisma.loan.create({
      data: {
        tenantId: TENANT,
        equipmentId: await novoEquipamento(),
        userId: pessoa,
        dueAt: PASSADO,
        returnedAt: PASSADO,
      },
    });

    const res = await solicitar(pessoa, await novoEquipamento());

    expect(res.status).toBe(201);
  });

  it('test_ca_10_emprestimos_de_outra_pessoa_nao_contam', async () => {
    const outra = await novaPessoa();
    for (let i = 0; i < 3; i++) await emprestimoAberto(outra);

    const res = await solicitar(await novaPessoa(), await novoEquipamento());

    expect(res.status).toBe(201);
  });
});

describe('empréstimo em atraso', () => {
  it('test_ca_11_com_item_em_atraso_e_recusado_e_nada_e_criado', async () => {
    const pessoa = await novaPessoa();
    await emprestimoAberto(pessoa, PASSADO);
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_ATRASO, pessoa, equipamento, 'disponivel');
  });

  it('test_ca_11_com_atraso_e_limite_vale_o_motivo_do_atraso', async () => {
    const pessoa = await novaPessoa();
    await emprestimoAberto(pessoa, PASSADO);
    for (let i = 0; i < 2; i++) await emprestimoAberto(pessoa);
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento);

    await esperarRecusaSemEfeito(res, TIPO_ATRASO, pessoa, equipamento, 'disponivel');
  });

  it('test_ca_11_devolucao_ainda_no_futuro_nao_e_atraso', async () => {
    const pessoa = await novaPessoa();
    await emprestimoAberto(pessoa, new Date(Date.now() + 60_000));

    const res = await solicitar(pessoa, await novoEquipamento());

    expect(res.status).toBe(201);
  });

  it('test_ca_11_atraso_ja_devolvido_nao_bloqueia', async () => {
    const pessoa = await novaPessoa();
    await prisma.loan.create({
      data: {
        tenantId: TENANT,
        equipmentId: await novoEquipamento(),
        userId: pessoa,
        dueAt: PASSADO,
        returnedAt: PASSADO,
      },
    });

    const res = await solicitar(pessoa, await novoEquipamento());

    expect(res.status).toBe(201);
  });

  it('test_ca_11_atraso_de_outra_pessoa_nao_bloqueia', async () => {
    await emprestimoAberto(await novaPessoa(), PASSADO);

    const res = await solicitar(await novaPessoa(), await novoEquipamento());

    expect(res.status).toBe(201);
  });
});

describe('pedidos simultâneos', () => {
  it('test_ca_12_duas_pessoas_no_mesmo_equipamento_criam_so_um', async () => {
    const [ana, bruno] = [await novaPessoa(), await novaPessoa()];
    const equipamento = await novoEquipamento();

    const respostas = await Promise.all([
      solicitar(ana, equipamento),
      solicitar(bruno, equipamento),
    ]);

    expect(respostas.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(respostas.find((res) => res.status === 409)?.body).toMatchObject({
      type: TIPO_INDISPONIVEL,
    });
    expect(await emprestimosDo(equipamento)).toBe(1);
    expect(await situacao(equipamento)).toBe('emprestado');
  });

  it('test_ca_12_dez_pessoas_no_mesmo_equipamento_criam_so_um', async () => {
    const pessoas = await Promise.all(Array.from({ length: 10 }, () => novaPessoa()));
    const equipamento = await novoEquipamento();

    const respostas = await Promise.all(pessoas.map((pessoa) => solicitar(pessoa, equipamento)));

    const situacoes = respostas.map((res) => res.status).sort();
    expect(situacoes).toEqual([201, ...Array<number>(9).fill(409)]);
    expect(await emprestimosDo(equipamento)).toBe(1);
  });

  it('test_ca_12_mesma_pessoa_com_2_em_aberto_em_dois_equipamentos_cria_so_um', async () => {
    const pessoa = await novaPessoa();
    for (let i = 0; i < 2; i++) await emprestimoAberto(pessoa);
    const [primeiro, segundo] = [await novoEquipamento(), await novoEquipamento()];

    const respostas = await Promise.all([solicitar(pessoa, primeiro), solicitar(pessoa, segundo)]);

    expect(respostas.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(respostas.find((res) => res.status === 409)?.body).toMatchObject({ type: TIPO_LIMITE });
    expect(await prisma.loan.count({ where: { userId: pessoa, returnedAt: null } })).toBe(3);
    // O equipamento recusado continua disponível.
    const status = [await situacao(primeiro), await situacao(segundo)].sort();
    expect(status).toEqual(['disponivel', 'emprestado']);
  });

  it('test_ca_12_mesma_pessoa_com_muitos_pedidos_nunca_passa_de_3', async () => {
    const pessoa = await novaPessoa();
    const equipamentos = await Promise.all(Array.from({ length: 8 }, () => novoEquipamento()));

    const respostas = await Promise.all(equipamentos.map((id) => solicitar(pessoa, id)));

    expect(respostas.filter((res) => res.status === 201)).toHaveLength(3);
    expect(respostas.filter((res) => res.status === 409)).toHaveLength(5);
    expect(await prisma.loan.count({ where: { userId: pessoa, returnedAt: null } })).toBe(3);
  });

  it('test_ca_12_com_uma_conexao_so_como_em_producao_nao_da_erro_500', async () => {
    const umaConexao = createTestPrisma('connection_limit=1');
    const appUmaConexao = await createTestApp({
      overrides: [{ provide: PrismaService, useValue: umaConexao }, tokens.keySetOverride],
    });
    try {
      const pessoas = await Promise.all(Array.from({ length: 6 }, () => novaPessoa()));
      const equipamento = await novoEquipamento();

      const respostas = await Promise.all(
        pessoas.map((pessoa) => solicitar(pessoa, equipamento, appUmaConexao)),
      );

      const situacoes = respostas.map((res) => res.status).sort();
      expect(situacoes).toEqual([201, ...Array<number>(5).fill(409)]);
      expect(await emprestimosDo(equipamento)).toBe(1);
    } finally {
      await appUmaConexao.close();
      await umaConexao.$disconnect();
    }
  });
});

describe('atomicidade', () => {
  // Trigger só para uma pessoa: quebra o INSERT no Postgres de verdade, sem mock,
  // e não afeta os outros testes, que usam o mesmo banco.
  async function quebrarInsert(tabela: string, coluna: string, pessoa: string) {
    await prisma.$executeRawUnsafe(`
      create or replace function public.falha_de_teste() returns trigger language plpgsql as
      $$ begin raise exception 'falha de teste'; end $$`);
    await prisma.$executeRawUnsafe(`
      create trigger "falha_${randomUUID()}" before insert on public."${tabela}"
      for each row when (new."${coluna}" = '${pessoa}') execute function public.falha_de_teste()`);
  }

  it('test_ca_08_se_a_auditoria_falha_nada_fica_gravado', async () => {
    const pessoa = await novaPessoa();
    const equipamento = await novoEquipamento();
    await quebrarInsert('audit_log', 'actor_id', pessoa);

    const res = await solicitar(pessoa, equipamento);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('falha de teste');
    expect(await situacao(equipamento)).toBe('disponivel');
    expect(await emprestimosDo(equipamento)).toBe(0);
  });

  it('test_ca_08_se_o_emprestimo_falha_o_equipamento_continua_disponivel', async () => {
    const pessoa = await novaPessoa();
    const equipamento = await novoEquipamento();
    await quebrarInsert('loans', 'user_id', pessoa);

    const res = await solicitar(pessoa, equipamento);

    expect(res.status).toBe(500);
    expect(await situacao(equipamento)).toBe('disponivel');
    expect(await emprestimosDo(equipamento)).toBe(0);
    expect(await auditoriaDe(pessoa)).toBe(0);
  });
});

describe('o usuário e o tenant vêm só do token', () => {
  it('test_ca_14_corpo_com_outro_usuario_e_outro_tenant_e_ignorado', async () => {
    const pessoa = await novaPessoa();
    const outra = await novaPessoa();
    const equipamento = await novoEquipamento();

    const res = await solicitar(pessoa, equipamento, app, {
      userId: outra,
      tenantId: OUTRO_TENANT,
      dueAt: FUTURO.toISOString(),
    });

    const { id, dueAt } = res.body as { id: string; dueAt: string };
    expect(res.status).toBe(201);
    expect(dueAt).not.toBe(FUTURO.toISOString());
    expect(await prisma.loan.findUniqueOrThrow({ where: { id } })).toMatchObject({
      userId: pessoa,
      tenantId: TENANT,
    });
  });

  it('test_ca_14_isolamento_equipamento_de_outro_tenant_responde_404_e_nada_e_criado', async () => {
    const pessoa = await novaPessoa();
    const deOutroTenant = await novoEquipamento('disponivel', OUTRO_TENANT);

    const res = await solicitar(pessoa, deOutroTenant);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, instance: '/v1/loans' });
    expect(await situacao(deOutroTenant)).toBe('disponivel');
    expect(await emprestimosDo(deOutroTenant)).toBe(0);
    expect(await auditoriaDe(pessoa)).toBe(0);
  });

  it('test_ca_14_equipamento_inexistente_responde_404', async () => {
    const res = await solicitar(await novaPessoa(), randomUUID());

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404 });
  });

  it('test_ca_14_sem_token_responde_401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/loans')
      .send({ equipmentId: await novoEquipamento() });

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, instance: '/v1/loans' });
  });

  it('test_ca_14_token_sem_tenant_responde_403', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/loans')
      .set('Authorization', `Bearer ${await tokens.sign({ sub: randomUUID() })}`)
      .send({ equipmentId: await novoEquipamento() });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403 });
  });

  it('test_ca_14_sem_membership_responde_403_e_nada_e_criado', async () => {
    const semMembership = randomUUID();
    await prisma.$executeRaw`insert into auth.users (id, email) values (${semMembership}::uuid, ${semMembership + '@test.local'})`;
    const equipamento = await novoEquipamento();

    const res = await solicitar(semMembership, equipamento);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      status: 403,
      detail: 'Seu usuário não tem acesso. Fale com Operações.',
    });
    expect(await situacao(equipamento)).toBe('disponivel');
    expect(await emprestimosDo(equipamento)).toBe(0);
  });

  it('test_ca_14_membership_so_em_outro_tenant_responde_403', async () => {
    const deOutroTenant = await novaPessoa(OUTRO_TENANT);
    const equipamento = await novoEquipamento();

    const res = await solicitar(deOutroTenant, equipamento);

    expect(res.status).toBe(403);
    expect(await emprestimosDo(equipamento)).toBe(0);
  });

  it.each([
    ['sem_equipamento', {}],
    ['id_que_nao_e_uuid', { equipmentId: 'TI-0001' }],
    ['id_numerico', { equipmentId: 1 }],
  ])('test_ca_14_corpo_invalido_%s_responde_400', async (_caso, corpo) => {
    const res = await request(app.getHttpServer())
      .post('/v1/loans')
      .set('Authorization', `Bearer ${await tokenDe(await novaPessoa())}`)
      .send(corpo);

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 400, type: 'about:blank' });
  });
});
