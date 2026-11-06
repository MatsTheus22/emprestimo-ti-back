import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createSuperuserTestPrisma, createTestPrisma } from './test-database';

// Spec 004 CA-02, CA-03 e CA-04: `anon` e `authenticated` só leem, e leem pouco.
// ADR-001 §7: deny by default. O papel na membership vai para o token, então
// escrita nessa tabela seria escalada de privilégio.

const TENANT = randomUUID();
const OUTRO_TENANT = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();
const CARLA = randomUUID(); // só no outro tenant

const TABELAS_DE_DOMINIO = ['loans', 'equipment', 'memberships', 'tenants', 'audit_log'];
const TABELAS_FECHADAS = [...TABELAS_DE_DOMINIO, '_prisma_migrations'];
const PAPEIS = ['anon', 'authenticated'];

let prisma: PrismaService;
let superuser: PrismaService;

type Claims = Record<string, string>;
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

function claimsDe(userId: string, tenantId: string = TENANT): Claims {
  return { sub: userId, tenant_id: tenantId, app_role: 'colaborador' };
}

// Erro que força o ROLLBACK: mesmo que a permissão falhe, o teste não deixa dado alterado.
class Aceito extends Error {}

// Roda o comando com o papel e os claims e sempre desfaz. Só devolve se foi negado.
async function tentar(papel: string, claims: Claims | null, sql: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`set local role ${papel}`);
    if (claims) {
      await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    }
    await tx.$executeRawUnsafe(sql);
    throw new Aceito(`Comando aceito: ${sql}`);
  });
}

function comoUsuario<T>(claims: Claims | null, consulta: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('set local role authenticated');
    if (claims) {
      await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    }
    return consulta(tx);
  });
}

async function usuariosVisiveis(tabela: string, coluna: string, claims: Claims | null) {
  const linhas = await comoUsuario(claims, (tx) =>
    tx.$queryRawUnsafe<{ usuario: string }[]>(
      `select "${coluna}"::text as usuario from "${tabela}"
       where "${coluna}" in ('${ANA}', '${BRUNO}', '${CARLA}')`,
    ),
  );
  return linhas.map((linha) => linha.usuario).sort();
}

async function novoEquipamento(tenantId: string): Promise<string> {
  const { id } = await prisma.equipment.create({
    data: { tenantId, category: 'notebook', name: 'Notebook', assetTag: randomUUID() },
  });
  return id;
}

beforeAll(async () => {
  prisma = createTestPrisma();
  superuser = createSuperuserTestPrisma();

  await prisma.tenant.createMany({
    data: [
      { id: TENANT, slug: 'perm_' + TENANT, name: 'Permissões' },
      { id: OUTRO_TENANT, slug: 'perm_' + OUTRO_TENANT, name: 'Outro' },
    ],
  });
  const pessoas = [
    { userId: ANA, tenantId: TENANT, role: 'colaborador' },
    { userId: BRUNO, tenantId: TENANT, role: 'operacoes' },
    { userId: CARLA, tenantId: OUTRO_TENANT, role: 'colaborador' },
  ];
  for (const { userId, tenantId, role } of pessoas) {
    await prisma.$executeRaw`insert into auth.users (id, email) values (${userId}::uuid, ${userId + '@test.local'})`;
    await prisma.membership.create({ data: { userId, tenantId, role } });
    await prisma.loan.create({
      data: { tenantId, userId, equipmentId: await novoEquipamento(tenantId) },
    });
    await prisma.auditLog.create({
      data: { tenantId, actorId: userId, action: 'loan.create', resource: 'loan' },
    });
  }
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), superuser.$disconnect()]);
});

describe('escrita negada', () => {
  const COMANDOS: [string, (tabela: string) => string][] = [
    ['insert', (tabela) => `insert into public."${tabela}" default values`],
    ['update', (tabela) => `update public."${tabela}" set id = id where false`],
    ['delete', (tabela) => `delete from public."${tabela}" where false`],
    ['truncate', (tabela) => `truncate public."${tabela}"`],
  ];

  describe.each(PAPEIS)('%s', (papel) => {
    describe.each(TABELAS_FECHADAS)('%s', (tabela) => {
      it.each(COMANDOS)(`test_ca_02_${papel}_nao_faz_%s_em_${tabela}`, async (_nome, sql) => {
        await expect(tentar(papel, claimsDe(ANA), sql(tabela))).rejects.toThrow(
          /permission denied/,
        );
      });
    });

    it.each(TABELAS_FECHADAS)(
      `test_ca_02_${papel}_nao_tem_references_nem_trigger_em_%s`,
      async (tabela) => {
        const [linha] = await prisma.$queryRawUnsafe<{ references: boolean; trigger: boolean }[]>(
          `select has_table_privilege('${papel}', 'public."${tabela}"', 'references') as references,
                  has_table_privilege('${papel}', 'public."${tabela}"', 'trigger') as trigger`,
        );

        expect(linha).toEqual({ references: false, trigger: false });
      },
    );
  });

  it.each(PAPEIS)('test_ca_02_tabela_nova_nasce_sem_escrita_para_%s', async (papel) => {
    const tabela = `tabela_nova_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`create table public."${tabela}" (id int)`);
    try {
      const [linha] = await prisma.$queryRawUnsafe<{ escrita: boolean }[]>(
        `select has_table_privilege('${papel}', 'public."${tabela}"',
           'insert, update, delete, truncate, references, trigger') as escrita`,
      );

      expect(linha?.escrita).toBe(false);
    } finally {
      await prisma.$executeRawUnsafe(`drop table public."${tabela}"`);
    }
  });
});

describe('o colaborador não muda o que não é dele', () => {
  const papelDe = async (userId: string) =>
    (await prisma.membership.findFirstOrThrow({ where: { userId } })).role;

  it('test_ca_02_colaborador_nao_altera_o_proprio_papel', async () => {
    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `update memberships set role = 'operacoes' where user_id = '${ANA}'`,
      ),
    ).rejects.toThrow(/permission denied/);

    expect(await papelDe(ANA)).toBe('colaborador');
  });

  it('test_ca_02_colaborador_nao_altera_o_papel_de_outra_pessoa', async () => {
    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `update memberships set role = 'colaborador' where user_id = '${BRUNO}'`,
      ),
    ).rejects.toThrow(/permission denied/);

    expect(await papelDe(BRUNO)).toBe('operacoes');
  });

  it('test_ca_02_colaborador_nao_apaga_membership_alheia', async () => {
    await expect(
      tentar('authenticated', claimsDe(ANA), `delete from memberships where user_id = '${BRUNO}'`),
    ).rejects.toThrow(/permission denied/);

    expect(await prisma.membership.count({ where: { userId: BRUNO } })).toBe(1);
  });

  it('test_ca_02_colaborador_nao_renomeia_o_tenant', async () => {
    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `update tenants set name = 'x' where id = '${TENANT}'`,
      ),
    ).rejects.toThrow(/permission denied/);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: TENANT } });
    expect(tenant.name).toBe('Permissões');
  });

  it('test_ca_02_colaborador_nao_forja_registro_de_auditoria', async () => {
    const antes = await prisma.auditLog.count({ where: { tenantId: TENANT } });

    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `insert into audit_log (tenant_id, actor_id, action, resource)
         values ('${TENANT}', '${BRUNO}', 'loan.create', 'loan')`,
      ),
    ).rejects.toThrow(/permission denied/);

    expect(await prisma.auditLog.count({ where: { tenantId: TENANT } })).toBe(antes);
  });

  it('test_ca_02_colaborador_nao_cria_emprestimo_sem_a_api', async () => {
    const equipamento = await novoEquipamento(TENANT);

    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `insert into loans (tenant_id, equipment_id, user_id)
         values ('${TENANT}', '${equipamento}', '${ANA}')`,
      ),
    ).rejects.toThrow(/permission denied/);

    expect(await prisma.loan.count({ where: { equipmentId: equipamento } })).toBe(0);
  });

  it('test_ca_02_colaborador_nao_muda_a_situacao_do_equipamento', async () => {
    const equipamento = await novoEquipamento(TENANT);

    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `update equipment set status = 'manutencao' where id = '${equipamento}'`,
      ),
    ).rejects.toThrow(/permission denied/);

    const { status } = await prisma.equipment.findUniqueOrThrow({ where: { id: equipamento } });
    expect(status).toBe('disponivel');
  });
});

describe('leitura limitada', () => {
  describe.each([
    { tabela: 'loans', coluna: 'user_id' },
    { tabela: 'memberships', coluna: 'user_id' },
    { tabela: 'audit_log', coluna: 'actor_id' },
  ])('$tabela', ({ tabela, coluna }) => {
    it(`test_ca_03_${tabela}_devolve_so_a_propria_pessoa`, async () => {
      expect(await usuariosVisiveis(tabela, coluna, claimsDe(ANA))).toEqual([ANA]);
      expect(await usuariosVisiveis(tabela, coluna, claimsDe(BRUNO))).toEqual([BRUNO]);
    });

    it(`test_ca_03_${tabela}_token_de_outro_tenant_nao_ve_a_propria_linha_de_la`, async () => {
      expect(await usuariosVisiveis(tabela, coluna, claimsDe(ANA, OUTRO_TENANT))).toEqual([]);
    });

    it(`test_ca_03_${tabela}_sem_claim_nao_ve_nada`, async () => {
      expect(await usuariosVisiveis(tabela, coluna, null)).toEqual([]);
    });

    it(`test_ca_03_${tabela}_anon_nao_ve_nada`, async () => {
      const linhas = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('set local role anon');
        return tx.$queryRawUnsafe<unknown[]>(`select 1 from "${tabela}"`);
      });

      expect(linhas).toEqual([]);
    });
  });

  it.each([
    { tabela: 'equipment', coluna: 'tenant_id' },
    { tabela: 'tenants', coluna: 'id' },
  ])('test_ca_03_$tabela_continua_com_leitura_por_tenant', async ({ tabela, coluna }) => {
    const tenants = await comoUsuario(claimsDe(ANA), (tx) =>
      tx.$queryRawUnsafe<{ tenant: string }[]>(
        `select distinct "${coluna}"::text as tenant from "${tabela}"
         where "${coluna}" in ('${TENANT}', '${OUTRO_TENANT}')`,
      ),
    );

    expect(tenants.map((linha) => linha.tenant)).toEqual([TENANT]);
  });
});

describe('hook do token', () => {
  it('test_ca_04_hook_continua_lendo_memberships_e_entrega_tenant_e_papel', async () => {
    const evento = { user_id: BRUNO, claims: { sub: BRUNO, role: 'authenticated' } };

    const resultado = await superuser.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role supabase_auth_admin');
      const [linha] = await tx.$queryRaw<{ result: { claims: Claims } }[]>`
        select public.custom_access_token_hook(${JSON.stringify(evento)}::jsonb) as result`;
      return linha?.result;
    });

    expect(resultado?.claims).toMatchObject({ tenant_id: TENANT, app_role: 'operacoes' });
  });

  it('test_ca_04_tentativa_de_mudar_o_papel_nao_chega_ao_token', async () => {
    await expect(
      tentar(
        'authenticated',
        claimsDe(ANA),
        `update memberships set role = 'operacoes' where user_id = '${ANA}'`,
      ),
    ).rejects.toThrow(/permission denied/);

    const evento = { user_id: ANA, claims: { sub: ANA, role: 'authenticated' } };
    const resultado = await superuser.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role supabase_auth_admin');
      const [linha] = await tx.$queryRaw<{ result: { claims: Claims } }[]>`
        select public.custom_access_token_hook(${JSON.stringify(evento)}::jsonb) as result`;
      return linha?.result;
    });

    expect(resultado?.claims).toMatchObject({ tenant_id: TENANT, app_role: 'colaborador' });
  });
});
