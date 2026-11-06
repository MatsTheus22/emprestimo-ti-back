import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 004 CA-01: no máximo um empréstimo aberto por equipamento.

const TENANT = randomUUID();
const USER = randomUUID();

let prisma: PrismaService;

async function newEquipment(): Promise<string> {
  const { id } = await prisma.equipment.create({
    data: {
      tenantId: TENANT,
      category: 'notebook',
      name: 'Notebook de teste',
      assetTag: randomUUID(),
    },
  });
  return id;
}

function openLoan(equipmentId: string) {
  return prisma.loan.create({ data: { tenantId: TENANT, equipmentId, userId: USER } });
}

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.$executeRaw`insert into auth.users (id, email) values (${USER}::uuid, ${USER + '@test.local'})`;
  await prisma.tenant.create({ data: { id: TENANT, slug: 'indice_' + TENANT, name: 'Índice' } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('índice de empréstimo aberto', () => {
  it('test_ca_01_recusa_segundo_emprestimo_aberto_no_mesmo_equipamento', async () => {
    const equipmentId = await newEquipment();
    await openLoan(equipmentId);

    await expect(openLoan(equipmentId)).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.loan.count({ where: { equipmentId } })).toBe(1);
  });

  it('test_ca_01_aceita_novo_emprestimo_depois_da_devolucao', async () => {
    const equipmentId = await newEquipment();
    const primeiro = await openLoan(equipmentId);
    await prisma.loan.update({ where: { id: primeiro.id }, data: { returnedAt: new Date() } });

    await expect(openLoan(equipmentId)).resolves.toMatchObject({ returnedAt: null });
    expect(await prisma.loan.count({ where: { equipmentId } })).toBe(2);
  });

  it('test_ca_01_equipamentos_diferentes_nao_conflitam', async () => {
    await openLoan(await newEquipment());

    await expect(openLoan(await newEquipment())).resolves.toMatchObject({ returnedAt: null });
  });
});
