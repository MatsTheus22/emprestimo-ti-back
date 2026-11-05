import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { seedTenant } from './seed';

// Spec 003: grava os equipamentos iniciais. Só insere o que falta: o que já existe
// fica como está, então uma situação alterada depois não volta ao valor da lista.

export interface EquipamentoInicial {
  assetTag: string;
  name: string;
  category: string;
  status: string;
  imagePath: string;
  photoSource: string;
  photoAuthor: string;
  photoLicense: string;
}

export interface ResultadoSeed {
  criadas: number;
  jaExistiam: number;
  total: number;
}

export function lerEquipamentosIniciais(): EquipamentoInicial[] {
  const arquivo = path.join(__dirname, 'dados', 'equipamentos-iniciais.json');
  return JSON.parse(readFileSync(arquivo, 'utf8')) as EquipamentoInicial[];
}

export async function seedEquipamentos(
  prisma: PrismaClient,
  tenantId: string,
): Promise<ResultadoSeed> {
  const itens = lerEquipamentosIniciais();
  // skipDuplicates vira ON CONFLICT DO NOTHING no índice (tenant_id, asset_tag).
  const { count } = await prisma.equipment.createMany({
    data: itens.map((item) => ({ ...item, tenantId })),
    skipDuplicates: true,
  });
  const total = await prisma.equipment.count({ where: { tenantId } });
  return { criadas: count, jaExistiam: itens.length - count, total };
}

export function formatarResultado({ criadas, jaExistiam, total }: ResultadoSeed): string {
  return `criadas: ${criadas} · já existiam: ${jaExistiam} · total: ${total}`;
}

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost']);

function urlDoBancoLocal(): string {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');
  const { hostname } = new URL(url);
  if (!HOSTS_LOCAIS.has(hostname)) throw new Error(`--alvo local recusa o host "${hostname}".`);
  return url;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { alvo: { type: 'string' } } });
  if (values.alvo !== 'local') throw new Error('Informe --alvo local.');

  const prisma = new PrismaClient({ datasourceUrl: urlDoBancoLocal() });
  try {
    const tenant = await seedTenant(prisma);
    console.log(formatarResultado(await seedEquipamentos(prisma, tenant.id)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
