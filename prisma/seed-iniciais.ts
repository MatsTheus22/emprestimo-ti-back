import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
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

export function exigirBancoLocal(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL não definida.');
  const { hostname } = new URL(url);
  if (!HOSTS_LOCAIS.has(hostname)) throw new Error(`--alvo local recusa o host "${hostname}".`);
  return url;
}

// Aceita a conexão direta (db.<ref>.supabase.co) e a do pooler (usuário postgres.<ref>).
export function refDoProjeto(url: string): string {
  const { hostname, username } = new URL(url);
  const direta = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(hostname);
  if (direta) return direta[1];
  const pooler = /^postgres\.([a-z0-9]+)$/i.exec(username);
  if (pooler && hostname.endsWith('.pooler.supabase.com')) return pooler[1];
  throw new Error(`Host "${hostname}" não é de um projeto Supabase.`);
}

export function exigirCondicoesDeProducao(
  isTTY: boolean,
  url: string | undefined,
): { url: string; ref: string } {
  if (!isTTY) throw new Error('--alvo producao exige terminal interativo: só o usuário executa.');
  if (!url) throw new Error('--alvo producao lê DATABASE_URL só do processo, nunca de arquivo.');
  if (HOSTS_LOCAIS.has(new URL(url).hostname))
    throw new Error('--alvo producao recusa host local.');
  return { url, ref: refDoProjeto(url) };
}

export interface Ambiente {
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
  carregarArquivoEnv: () => void;
  perguntar: (texto: string) => Promise<string>;
  avisar: (texto: string) => void;
}

// Decide para qual banco o script escreve. Em produção, nenhum arquivo é lido.
export async function resolverUrl(alvo: string | undefined, ambiente: Ambiente): Promise<string> {
  if (alvo === 'local') {
    ambiente.carregarArquivoEnv();
    return exigirBancoLocal(ambiente.env.DATABASE_URL);
  }
  if (alvo === 'producao') {
    const { url, ref } = exigirCondicoesDeProducao(ambiente.isTTY, ambiente.env.DATABASE_URL);
    ambiente.avisar(`Destino: ${new URL(url).hostname}`);
    const digitado = await ambiente.perguntar(`Digite o ref do projeto (${ref}) para confirmar: `);
    if (digitado.trim() !== ref) throw new Error('Confirmação não confere. Nada foi gravado.');
    return url;
  }
  throw new Error('Informe --alvo local ou --alvo producao.');
}

// A URL de conexão traz a credencial do banco: não pode aparecer no terminal.
export function semUrlDeConexao(texto: string): string {
  return texto.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '<url omitida>');
}

async function perguntarNoTerminal(texto: string): Promise<string> {
  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await leitor.question(texto);
  } finally {
    leitor.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { alvo: { type: 'string' } } });
  const datasourceUrl = await resolverUrl(values.alvo, {
    env: process.env,
    isTTY: process.stdin.isTTY === true,
    carregarArquivoEnv: () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
    },
    perguntar: perguntarNoTerminal,
    avisar: (texto) => console.log(texto),
  });

  const prisma = new PrismaClient({ datasourceUrl });
  try {
    const tenant = await seedTenant(prisma);
    console.log(formatarResultado(await seedEquipamentos(prisma, tenant.id)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(semUrlDeConexao(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
