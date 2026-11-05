import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 003 CA-01: colunas de imagem e créditos, patrimônio obrigatório e único
// por tenant, categoria restrita.

let prisma: PrismaService;
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();

beforeAll(async () => {
  prisma = createTestPrisma();
  for (const id of [TENANT_A, TENANT_B]) {
    await prisma.tenant.create({ data: { id, slug: 'equip_' + id, name: 'Equipamentos' } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function equipamento(tenantId: string, assetTag: string, category = 'notebook') {
  return { tenantId, assetTag, category, name: 'Item ' + assetTag };
}

describe('equipment: colunas, patrimônio e categoria', () => {
  it('test_ca_01_guarda_imagem_e_creditos', async () => {
    const criado = await prisma.equipment.create({
      data: {
        ...equipamento(TENANT_A, 'CRED-1'),
        imagePath: 'CRED-1.jpg',
        photoSource: 'https://pixabay.com/photos/exemplo-1/',
        photoAuthor: 'autor',
        photoLicense: 'Pixabay Content License',
      },
    });

    expect(criado).toMatchObject({
      imagePath: 'CRED-1.jpg',
      photoSource: 'https://pixabay.com/photos/exemplo-1/',
      photoAuthor: 'autor',
      photoLicense: 'Pixabay Content License',
    });
  });

  it('test_ca_01_imagem_e_creditos_sao_opcionais', async () => {
    const criado = await prisma.equipment.create({ data: equipamento(TENANT_A, 'OPC-1') });

    expect(criado).toMatchObject({
      imagePath: null,
      photoSource: null,
      photoAuthor: null,
      photoLicense: null,
    });
  });

  it('test_ca_01_recusa_linha_sem_patrimonio', async () => {
    await expect(
      prisma.$executeRaw`insert into equipment (tenant_id, category, name, asset_tag)
        values (${TENANT_A}::uuid, 'notebook', 'Sem patrimônio', null)`,
    ).rejects.toThrow(/23502/); // not_null_violation
  });

  it('test_ca_01_recusa_mesmo_patrimonio_no_mesmo_tenant', async () => {
    await prisma.equipment.create({ data: equipamento(TENANT_A, 'DUP-1') });

    await expect(
      prisma.$executeRaw`insert into equipment (tenant_id, category, name, asset_tag)
        values (${TENANT_A}::uuid, 'notebook', 'Repetido', 'DUP-1')`,
    ).rejects.toThrow(/23505/); // unique_violation
    await expect(
      prisma.equipment.count({ where: { tenantId: TENANT_A, assetTag: 'DUP-1' } }),
    ).resolves.toBe(1);
  });

  it('test_ca_01_aceita_mesmo_patrimonio_em_outro_tenant', async () => {
    await prisma.equipment.create({ data: equipamento(TENANT_A, 'OUTRO-1') });
    const noOutro = await prisma.equipment.create({ data: equipamento(TENANT_B, 'OUTRO-1') });

    expect(noOutro).toMatchObject({ tenantId: TENANT_B, assetTag: 'OUTRO-1' });
  });

  it.each(['notebook', 'monitor', 'cabo', 'camera'])(
    'test_ca_01_aceita_categoria_%s',
    async (category) => {
      const criado = await prisma.equipment.create({
        data: equipamento(TENANT_A, 'CAT-' + category, category),
      });

      expect(criado.category).toBe(category);
    },
  );

  it.each(['Notebook', 'câmera', 'tablet', ''])(
    'test_ca_01_recusa_categoria_invalida_%s',
    async (category) => {
      await expect(
        prisma.$executeRaw`insert into equipment (tenant_id, category, name, asset_tag)
          values (${TENANT_A}::uuid, ${category}, 'Categoria inválida', ${'INV-' + category})`,
      ).rejects.toThrow(/23514/); // check_violation
    },
  );
});
