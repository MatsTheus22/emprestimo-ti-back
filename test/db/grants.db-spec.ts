import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Migration 20261019132041: grants padrão do Supabase explícitos (reset e
// deploy ficam iguais) e _prisma_migrations fechada para quem não é dono.

const DOMAIN_TABLES = ['tenants', 'memberships', 'equipment', 'loans', 'audit_log'];

let prisma: PrismaService;

async function countAs(role: string, table: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`set local role ${role}`);
    const [row] = await tx.$queryRawUnsafe<{ total: bigint }[]>(
      `select count(*) as total from public."${table}"`,
    );
    return Number(row?.total ?? -1);
  });
}

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('grants do schema public', () => {
  it.each(DOMAIN_TABLES)(
    'test_ca_04_authenticated_tem_select_em_%s_e_o_rls_decide_as_linhas',
    async (table) => {
      const [row] = await prisma.$queryRawUnsafe<{ allowed: boolean }[]>(
        `select has_table_privilege('authenticated', 'public.${table}', 'select') as allowed`,
      );

      expect(row?.allowed).toBe(true);
    },
  );

  it.each(['anon', 'authenticated'])(
    'test_ca_04_%s_nao_le_o_historico_de_migrations',
    async (role) => {
      // O dono vê as migrations aplicadas; os outros papéis, nenhuma.
      expect(await countAs('postgres', '_prisma_migrations')).toBeGreaterThan(0);
      expect(await countAs(role, '_prisma_migrations')).toBe(0);
    },
  );
});
