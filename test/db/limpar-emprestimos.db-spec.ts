import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  acharConta,
  CONTA_PROTEGIDA,
  emprestimosDaConta,
  limparEmprestimos,
  resumoFinal,
} from '../../prisma/limpar-emprestimos-teste';
import { seedTenant } from '../../prisma/seed';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 004 CA-17 e CA-18: o script de limpeza contra Postgres real.

const TENANT = randomUUID();
const OUTRO_TENANT = randomUUID();
const RAIZ = path.resolve(__dirname, '..', '..');

let prisma: PrismaService;

async function novaConta(tenantIds: string[] = [TENANT], email?: string) {
  const id = randomUUID();
  const enderecoFinal = email ?? `${id}@test.local`;
  await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${enderecoFinal})`;
  for (const tenantId of tenantIds) {
    await prisma.membership.create({ data: { userId: id, tenantId, role: 'colaborador' } });
  }
  return { id, email: enderecoFinal };
}

async function emprestimo(
  userId: string,
  {
    tenantId = TENANT,
    status = 'emprestado',
    returnedAt,
    equipmentId,
  }: { tenantId?: string; status?: string; returnedAt?: Date; equipmentId?: string } = {},
) {
  const equipamento =
    equipmentId ??
    (
      await prisma.equipment.create({
        data: { tenantId, category: 'cabo', name: 'Cabo', assetTag: randomUUID(), status },
      })
    ).id;
  await prisma.loan.create({
    data: {
      tenantId,
      userId,
      equipmentId: equipamento,
      ...(returnedAt ? { returnedAt } : {}),
    },
  });
  return equipamento;
}

async function situacao(equipmentId: string) {
  return (await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).status;
}

function limpar(userId: string, confirmados: number, tenantId: string = TENANT) {
  return limparEmprestimos(prisma, { tenantId, userId, confirmados });
}

function rodarScript(email: string, confirmacao: string) {
  return spawnSync(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      'prisma/limpar-emprestimos-teste.ts',
      '--alvo',
      'local',
      '--email',
      email,
    ],
    {
      cwd: RAIZ,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      input: `${confirmacao}\n`,
      timeout: 40_000,
    },
  );
}

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.tenant.createMany({
    data: [
      { id: TENANT, slug: 'limpar_' + TENANT, name: 'Limpar' },
      { id: OUTRO_TENANT, slug: 'limpar_' + OUTRO_TENANT, name: 'Outro' },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('limparEmprestimos', () => {
  it('test_ca_17_apaga_os_da_conta_e_devolve_os_equipamentos', async () => {
    const conta = await novaConta();
    const equipamentos = [await emprestimo(conta.id), await emprestimo(conta.id)];

    const resultado = await limpar(conta.id, 2);

    expect(resultado).toEqual({ apagados: 2, devolvidos: 2 });
    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(0);
    for (const id of equipamentos) expect(await situacao(id)).toBe('disponivel');
  });

  it('test_ca_17_nao_altera_emprestimo_nem_equipamento_de_outra_pessoa', async () => {
    const conta = await novaConta();
    const outra = await novaConta();
    await emprestimo(conta.id);
    const daOutra = await emprestimo(outra.id);

    await limpar(conta.id, 1);

    expect(await prisma.loan.count({ where: { userId: outra.id } })).toBe(1);
    expect(await situacao(daOutra)).toBe('emprestado');
  });

  it('test_ca_17_equipamento_em_manutencao_nao_volta_a_disponivel', async () => {
    const conta = await novaConta();
    const equipamento = await emprestimo(conta.id, { status: 'manutencao' });

    const resultado = await limpar(conta.id, 1);

    expect(resultado).toEqual({ apagados: 1, devolvidos: 0 });
    expect(await situacao(equipamento)).toBe('manutencao');
    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(0);
  });

  it('test_ca_17_emprestimo_devolvido_apaga_mas_nao_mexe_no_equipamento', async () => {
    // A conta devolveu o item, e hoje ele está com outra pessoa.
    const conta = await novaConta();
    const outra = await novaConta();
    const equipamento = await emprestimo(conta.id, { returnedAt: new Date() });
    await prisma.equipment.update({
      where: { id: equipamento },
      data: { status: 'emprestado' },
    });
    await emprestimo(outra.id, { equipmentId: equipamento });

    const resultado = await limpar(conta.id, 1);

    expect(resultado).toEqual({ apagados: 1, devolvidos: 0 });
    expect(await situacao(equipamento)).toBe('emprestado');
    expect(await prisma.loan.count({ where: { userId: outra.id } })).toBe(1);
  });

  it('test_ca_17_nao_altera_audit_log', async () => {
    const conta = await novaConta();
    await emprestimo(conta.id);
    await prisma.auditLog.create({
      data: {
        tenantId: TENANT,
        actorId: conta.id,
        action: 'loan.create',
        resource: 'loan',
        resourceId: randomUUID(),
      },
    });

    await limpar(conta.id, 1);

    expect(await prisma.auditLog.count({ where: { actorId: conta.id } })).toBe(1);
  });

  it('test_ca_17_rodar_de_novo_informa_zero', async () => {
    const conta = await novaConta();
    await emprestimo(conta.id);
    await limpar(conta.id, 1);

    await expect(limpar(conta.id, 0)).resolves.toEqual({ apagados: 0, devolvidos: 0 });
  });

  it('test_ca_17_nao_toca_na_mesma_conta_em_outro_tenant', async () => {
    const conta = await novaConta([TENANT, OUTRO_TENANT]);
    await emprestimo(conta.id);
    const la = await emprestimo(conta.id, { tenantId: OUTRO_TENANT });

    await limpar(conta.id, 1);

    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(1);
    expect(await situacao(la)).toBe('emprestado');
  });

  it('test_ca_18_se_os_emprestimos_mudaram_desde_a_confirmacao_nada_e_apagado', async () => {
    const conta = await novaConta();
    const equipamento = await emprestimo(conta.id);

    await expect(limpar(conta.id, 2)).rejects.toThrow(/mudaram.*Nada foi apagado/);

    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(1);
    expect(await situacao(equipamento)).toBe('emprestado');
  });

  it('test_ca_17_se_devolver_o_equipamento_falha_nenhum_emprestimo_e_apagado', async () => {
    const conta = await novaConta();
    const equipamento = await emprestimo(conta.id);
    await prisma.$executeRawUnsafe(`
      create or replace function public.falha_limpeza_teste() returns trigger language plpgsql as
      $$ begin raise exception 'falha de teste'; end $$`);
    await prisma.$executeRawUnsafe(`
      create trigger "falha_${randomUUID()}" before update on public.equipment
      for each row when (old.id = '${equipamento}') execute function public.falha_limpeza_teste()`);

    await expect(limpar(conta.id, 1)).rejects.toThrow();

    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(1);
  });
});

describe('acharConta', () => {
  it('test_ca_17_acha_sem_diferenciar_maiuscula', async () => {
    const conta = await novaConta([TENANT], `Pessoa.${randomUUID()}@Test.Local`);

    await expect(acharConta(prisma, conta.email.toLowerCase())).resolves.toEqual({
      id: conta.id,
      email: conta.email,
    });
  });

  it('test_ca_17_conta_inexistente_recusa', async () => {
    await expect(acharConta(prisma, `${randomUUID()}@test.local`)).rejects.toThrow(/não existe/);
  });

  it('test_ca_17_curinga_nao_acha_conta_nenhuma', async () => {
    await novaConta();

    await expect(acharConta(prisma, '%')).rejects.toThrow(/não existe/);
    await expect(acharConta(prisma, '%@test.local')).rejects.toThrow(/não existe/);
  });

  it('test_ca_17_recusa_a_conta_protegida_pelo_que_esta_no_banco', async () => {
    const protegida = await novaConta([TENANT], CONTA_PROTEGIDA.toUpperCase());

    await expect(acharConta(prisma, CONTA_PROTEGIDA)).rejects.toThrow(/protegida/);
    expect(protegida.id).toEqual(expect.any(String));
    await prisma.$executeRaw`delete from memberships where user_id = ${protegida.id}::uuid`;
    await prisma.$executeRaw`delete from auth.users where id = ${protegida.id}::uuid`;
  });
});

describe('o que o script mostra', () => {
  it('test_ca_17_lista_patrimonio_nome_retirada_e_devolucao_so_da_conta', async () => {
    const conta = await novaConta();
    const outra = await novaConta();
    const equipamento = await emprestimo(conta.id);
    await emprestimo(outra.id);
    await emprestimo(conta.id, { returnedAt: new Date() });

    const lista = await emprestimosDaConta(prisma, TENANT, conta.id);

    expect(lista).toHaveLength(2);
    expect(lista.find((item) => item.equipmentId === equipamento)).toMatchObject({
      name: 'Cabo',
      assetTag: expect.any(String) as string,
      aberto: true,
      borrowedAt: expect.any(Date) as Date,
      dueAt: expect.any(Date) as Date,
    });
  });

  it('test_ca_17_resumo_conta_os_da_protegida_e_as_situacoes', async () => {
    const tenantProprio = randomUUID();
    await prisma.tenant.create({
      data: { id: tenantProprio, slug: 'resumo_' + tenantProprio, name: 'Resumo' },
    });
    const protegida = await novaConta([tenantProprio], CONTA_PROTEGIDA);
    await emprestimo(protegida.id, { tenantId: tenantProprio });
    await prisma.equipment.create({
      data: {
        tenantId: tenantProprio,
        category: 'cabo',
        name: 'Livre',
        assetTag: randomUUID(),
        status: 'disponivel',
      },
    });

    await expect(resumoFinal(prisma, tenantProprio)).resolves.toEqual({
      daContaProtegida: 1,
      porSituacao: { disponivel: 1, emprestado: 1 },
    });

    await prisma.loan.deleteMany({ where: { userId: protegida.id } });
    await prisma.$executeRaw`delete from memberships where user_id = ${protegida.id}::uuid`;
    await prisma.$executeRaw`delete from auth.users where id = ${protegida.id}::uuid`;
  });
});

describe('script de ponta a ponta', () => {
  let tenantPadrao: string;

  beforeAll(async () => {
    tenantPadrao = (await seedTenant(prisma)).id;
  });

  it('test_ca_17_confirmando_apaga_e_informa_e_repetir_informa_zero', async () => {
    const conta = await novaConta([tenantPadrao]);
    const equipamento = await emprestimo(conta.id, { tenantId: tenantPadrao });

    const saida = rodarScript(conta.email, conta.email);

    expect(saida.stderr).toBe('');
    expect(saida.status).toBe(0);
    expect(saida.stdout).toMatch(/apagados: 1 · devolvidos: 1/);
    expect(saida.stdout).toMatch(/Conta protegida: 0 empréstimos/);
    expect(await situacao(equipamento)).toBe('disponivel');

    const repetida = rodarScript(conta.email, '');

    expect(repetida.status).toBe(0);
    expect(repetida.stdout).toMatch(/apagados: 0 · devolvidos: 0/);
  });

  it('test_ca_18_confirmacao_errada_nao_apaga', async () => {
    const conta = await novaConta([tenantPadrao]);
    const equipamento = await emprestimo(conta.id, { tenantId: tenantPadrao });

    const saida = rodarScript(conta.email, 'outro@test.local');

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/Nada foi apagado/);
    expect(await prisma.loan.count({ where: { userId: conta.id } })).toBe(1);
    expect(await situacao(equipamento)).toBe('emprestado');
  });

  it('test_ca_17_conta_inexistente_termina_com_erro', () => {
    const saida = rodarScript(`${randomUUID()}@test.local`, '');

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/não existe/);
  });
});
