import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// rules/tests.md item 3 + ADR-001 §7: a policy de cada tabela de domínio
// é a última barreira entre tenants. Como o Prisma conecta com o dono das
// tabelas (que ignora RLS), cada consulta aqui assume o papel
// `authenticated` e os claims do JWT, exatamente o que a policy lê.

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();

const TABLES = [
  { table: 'tenants', tenantColumn: 'id' },
  { table: 'memberships', tenantColumn: 'tenant_id' },
  { table: 'equipment', tenantColumn: 'tenant_id' },
  { table: 'loans', tenantColumn: 'tenant_id' },
  { table: 'audit_log', tenantColumn: 'tenant_id' },
] as const;

let prisma: PrismaService;

async function visibleTenants(
  table: string,
  tenantColumn: string,
  claims: Record<string, string> | null,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('set local role authenticated');
    if (claims) {
      await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    }
    const rows = await tx.$queryRawUnsafe<{ tenant: string }[]>(
      `select "${tenantColumn}"::text as tenant from "${table}"`,
    );
    return rows.map((row) => row.tenant);
  });
}

beforeAll(async () => {
  prisma = createTestPrisma();

  // Fixtures inseridas como dono das tabelas (ignora RLS): uma linha por
  // tenant em cada tabela.
  const fixtures = [
    { tenant: TENANT_A, user: USER_A, slug: 'tenant_a' },
    { tenant: TENANT_B, user: USER_B, slug: 'tenant_b' },
  ];
  for (const { tenant, user, slug } of fixtures) {
    await prisma.$executeRaw`insert into auth.users (id, email) values (${user}::uuid, ${slug + '@test.local'})`;
    await prisma.tenant.create({ data: { id: tenant, slug, name: slug } });
    await prisma.membership.create({
      data: { userId: user, tenantId: tenant, role: 'colaborador' },
    });
    const equipment = await prisma.equipment.create({
      data: { tenantId: tenant, category: 'Notebook', name: 'Notebook ' + slug },
    });
    await prisma.loan.create({
      data: { tenantId: tenant, equipmentId: equipment.id, userId: user },
    });
    await prisma.auditLog.create({
      data: { tenantId: tenant, actorId: user, action: 'create', resource: 'equipment' },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.each(TABLES)('RLS em $table', ({ table, tenantColumn }) => {
  it(`test_ca_04_${table}_tenant_b_nao_ve_linhas_do_tenant_a`, async () => {
    const tenants = await visibleTenants(table, tenantColumn, { tenant_id: TENANT_B });

    expect(tenants).toEqual([TENANT_B]);
  });

  it(`test_ca_04_${table}_sem_claim_nao_ve_nada`, async () => {
    const tenants = await visibleTenants(table, tenantColumn, null);

    expect(tenants).toEqual([]);
  });

  it(`test_ca_04_${table}_dono_das_tabelas_ve_os_dois_tenants`, async () => {
    // Controle: prova que as linhas de A existem e foram escondidas pela policy.
    const rows = await prisma.$queryRawUnsafe<{ tenant: string }[]>(
      `select "${tenantColumn}"::text as tenant from "${table}"`,
    );

    expect(rows.map((row) => row.tenant).sort()).toEqual([TENANT_A, TENANT_B].sort());
  });
});
