import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 001 CA-02: memberships.display_name é obrigatório; linhas sem nome
// informado recebem string vazia.

let prisma: PrismaService;
const TENANT = randomUUID();

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.tenant.create({ data: { id: TENANT, slug: 'nome_' + TENANT, name: 'Nome' } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newUser(): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  return id;
}

describe('memberships.display_name', () => {
  it('test_ca_02_display_name_guarda_o_nome_informado', async () => {
    const membership = await prisma.membership.create({
      data: {
        userId: await newUser(),
        tenantId: TENANT,
        role: 'colaborador',
        displayName: 'Ana Ribeiro',
      },
    });

    expect(membership.displayName).toBe('Ana Ribeiro');
  });

  it('test_ca_02_sem_nome_informado_recebe_string_vazia', async () => {
    const membership = await prisma.membership.create({
      data: { userId: await newUser(), tenantId: TENANT, role: 'colaborador' },
    });

    expect(membership.displayName).toBe('');
  });

  it('test_ca_02_display_name_nao_aceita_nulo', async () => {
    const userId = await newUser();

    await expect(
      prisma.$executeRaw`insert into memberships (user_id, tenant_id, role, display_name)
        values (${userId}::uuid, ${TENANT}::uuid, 'colaborador', null)`,
    ).rejects.toThrow(/23502/); // not_null_violation
  });
});
