import { DEFAULT_TENANT, seedTenant } from '../../prisma/seed';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 001 CA-01: o seed cria o tenant suporte_ti e é idempotente.

let prisma: PrismaService;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed', () => {
  it('test_ca_01_seed_cria_tenant_suporte_ti_e_e_idempotente', async () => {
    const first = await seedTenant(prisma);
    const second = await seedTenant(prisma);

    const tenants = await prisma.tenant.findMany({ where: { slug: DEFAULT_TENANT.slug } });
    expect(second.id).toBe(first.id);
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({ id: first.id, slug: 'suporte_ti', name: 'Suporte de TI' });
  });
});
