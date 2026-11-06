import { randomUUID } from 'node:crypto';
import { lerEquipamentosIniciais, seedEquipamentos } from '../../prisma/seed-iniciais';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 003 CA-02, CA-03 e CA-04, contra Postgres real. Cada teste usa um tenant
// próprio, porque os arquivos de teste rodam em paralelo no mesmo banco.

let prisma: PrismaService;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function novoTenant(): Promise<string> {
  const id = randomUUID();
  await prisma.tenant.create({ data: { id, slug: 'iniciais_' + id, name: 'Iniciais' } });
  return id;
}

function linhasDoTenant(tenantId: string) {
  return prisma.equipment.findMany({ where: { tenantId }, orderBy: { assetTag: 'asc' } });
}

describe('seedEquipamentos', () => {
  it('test_ca_02_grava_os_12_equipamentos_iguais_a_lista', async () => {
    const tenantId = await novoTenant();

    const resultado = await seedEquipamentos(prisma, tenantId);

    expect(resultado).toEqual({ criadas: 12, jaExistiam: 0, total: 12 });
    const linhas = await linhasDoTenant(tenantId);
    expect(linhas).toHaveLength(12);
    expect(linhas).toEqual(
      lerEquipamentosIniciais().map((item): unknown =>
        expect.objectContaining({ ...item, tenantId }),
      ),
    );
  });

  it('test_ca_02_tres_em_manutencao_e_nove_disponiveis', async () => {
    const tenantId = await novoTenant();

    await seedEquipamentos(prisma, tenantId);

    const linhas = await linhasDoTenant(tenantId);
    expect(linhas.filter((l) => l.status === 'manutencao').map((l) => l.assetTag)).toEqual([
      'TI-0004',
      'TI-0007',
      'TI-0010',
    ]);
    expect(linhas.filter((l) => l.status === 'disponivel')).toHaveLength(9);
  });

  it('test_ca_03_rodar_de_novo_mantem_12_linhas_e_informa_zero_criadas', async () => {
    const tenantId = await novoTenant();
    await seedEquipamentos(prisma, tenantId);
    const antes = await linhasDoTenant(tenantId);

    const resultado = await seedEquipamentos(prisma, tenantId);

    expect(resultado).toEqual({ criadas: 0, jaExistiam: 12, total: 12 });
    await expect(linhasDoTenant(tenantId)).resolves.toEqual(antes);
  });

  it('test_ca_03_linha_que_difere_da_lista_nao_muda', async () => {
    const tenantId = await novoTenant();
    await seedEquipamentos(prisma, tenantId);
    await prisma.equipment.update({
      where: { tenantId_assetTag: { tenantId, assetTag: 'TI-0001' } },
      data: {
        status: 'emprestado',
        name: 'Outro nome',
        category: 'monitor',
        imagePath: 'outra.jpg',
        photoSource: 'https://exemplo.test/outra',
        photoAuthor: 'outro autor',
        photoLicense: 'outra licença',
      },
    });
    const antes = await linhasDoTenant(tenantId);

    await seedEquipamentos(prisma, tenantId);

    await expect(linhasDoTenant(tenantId)).resolves.toEqual(antes);
  });

  it('test_ca_03_recria_so_o_que_falta', async () => {
    const tenantId = await novoTenant();
    await seedEquipamentos(prisma, tenantId);
    await prisma.equipment.delete({
      where: { tenantId_assetTag: { tenantId, assetTag: 'TI-0012' } },
    });

    const resultado = await seedEquipamentos(prisma, tenantId);

    expect(resultado).toEqual({ criadas: 1, jaExistiam: 11, total: 12 });
  });

  it('test_ca_04_nao_cria_emprestimo_nem_membership_nem_usuario', async () => {
    const tenantId = await novoTenant();

    await seedEquipamentos(prisma, tenantId);

    await expect(prisma.loan.count({ where: { tenantId } })).resolves.toBe(0);
    await expect(prisma.membership.count({ where: { tenantId } })).resolves.toBe(0);
    const professor = await prisma.$queryRaw<{ total: bigint }[]>`
      select count(*) as total from auth.users
      where email = 'marcelo.grilo@institutojef.org.br'`;
    expect(professor[0]?.total).toBe(0n);
  });
});
