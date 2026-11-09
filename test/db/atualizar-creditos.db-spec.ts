import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lerEquipamentosIniciais } from '../../prisma/seed-iniciais';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestPrisma } from './test-database';

// Spec 005 CA-09: o SQL que o usuário cola no editor de produção, executado em Postgres real.
// Tudo roda numa transação desfeita no fim, porque outros arquivos de teste usam o tenant
// suporte_ti em paralelo. O arquivo fica na raiz do projeto: num clone só do back, é pulado.

const SQL = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'specs',
  '005-trocar-fotos',
  'atualizar-creditos.sql',
);

const TROCADOS = ['TI-0001', 'TI-0004', 'TI-0006', 'TI-0007', 'TI-0008', 'TI-0012'];

// Créditos que estão em produção antes da spec 005 (spec 003).
const ANTIGOS: Record<string, [string, string]> = {
  'TI-0001': [
    'https://pixabay.com/photos/laptop-workstation-browsing-tablet-1483974/',
    'Monoar_CGI_Artist',
  ],
  'TI-0004': ['https://pixabay.com/photos/laptop-workstaion-office-work-4906312/', 'Deeezy'],
  'TI-0006': ['https://pixabay.com/photos/computer-laptop-technology-desk-3114274/', 'malawiheiko'],
  'TI-0007': ['https://pixabay.com/photos/poster-mockup-mockup-poster-frame-2853836/', 'RaniRamli'],
  'TI-0008': ['https://pixabay.com/photos/hdmi-connector-cable-plug-2202226/', 'WikimediaImages'],
  'TI-0012': ['https://pixabay.com/photos/camera-digital-photography-1362419/', 'maddyjaya'],
};

// Em produção, a situação pode ter mudado depois do seed: o SQL não pode mexer nela.
const SITUACAO: Record<string, string> = { 'TI-0001': 'emprestado', 'TI-0002': 'emprestado' };
const ANTES = new Date('2026-11-05T12:00:00.000Z');

// Os comandos do arquivo, sem comentários. O primeiro é begin e o último, commit.
function comandosDoArquivo(): string[] {
  return readFileSync(SQL, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean);
}

function estadoAnterior(tenantId: string) {
  return lerEquipamentosIniciais().map((item) => {
    const [photoSource, photoAuthor] = ANTIGOS[item.assetTag] ?? [
      item.photoSource,
      item.photoAuthor,
    ];
    return {
      ...item,
      photoSource,
      photoAuthor,
      status: SITUACAO[item.assetTag] ?? item.status,
      tenantId,
      createdAt: ANTES,
      updatedAt: ANTES,
    };
  });
}

const DESFAZER = new Error('desfazer');

// Roda `corpo` numa transação e a desfaz no fim, mesmo quando tudo passa.
async function emTransacaoDesfeita(
  prisma: PrismaService,
  corpo: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await corpo(tx);
        throw DESFAZER;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (erro) {
    if (erro !== DESFAZER) throw erro;
  }
}

const comArquivo = existsSync(SQL) ? describe : describe.skip;

comArquivo('atualizar-creditos.sql', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('test_ca_09_arquivo_e_uma_transacao_com_6_update', () => {
    const comandos = comandosDoArquivo();

    expect(comandos[0]).toBe('begin');
    expect(comandos.at(-1)).toBe('commit');
    expect(comandos.slice(1, -1)).toHaveLength(6);
    for (const comando of comandos.slice(1, -1)) expect(comando).toMatch(/^update equipment\n/);
  });

  it('test_ca_09_troca_so_os_creditos_dos_6_com_o_mesmo_updated_at', async () => {
    const outroTenant = randomUUID();

    await emTransacaoDesfeita(prisma, async (tx) => {
      await tx.$executeRaw`insert into tenants (slug, name) values ('suporte_ti', 'Suporte de TI')
        on conflict (slug) do nothing`;
      const { id: suporte } = await tx.tenant.findUniqueOrThrow({ where: { slug: 'suporte_ti' } });
      await tx.tenant.create({
        data: { id: outroTenant, slug: 'outro_' + outroTenant, name: 'Outro' },
      });
      await tx.equipment.createMany({
        data: [...estadoAnterior(suporte), ...estadoAnterior(outroTenant)],
      });

      const linhas = (tenantId: string) =>
        tx.equipment.findMany({ where: { tenantId }, orderBy: { assetTag: 'asc' } });
      const antesSuporte = await linhas(suporte);
      const antesOutro = await linhas(outroTenant);

      for (const comando of comandosDoArquivo().slice(1, -1)) {
        await expect(tx.$executeRawUnsafe(comando)).resolves.toBe(1);
      }

      const depois = await linhas(suporte);
      const iniciais = lerEquipamentosIniciais();
      expect(depois).toHaveLength(12);
      for (const [indice, linha] of depois.entries()) {
        const antes = antesSuporte[indice];
        if (!TROCADOS.includes(linha.assetTag)) {
          expect(linha).toEqual(antes);
          continue;
        }
        const inicial = iniciais.find((item) => item.assetTag === linha.assetTag);
        expect(linha).toEqual({
          ...antes,
          photoSource: inicial?.photoSource,
          photoAuthor: inicial?.photoAuthor,
          updatedAt: expect.any(Date) as Date,
        });
      }

      // As 6 trocadas têm o now() da transação; as outras 6 continuam com outro valor.
      const comNowDaTransacao = await tx.$queryRaw<{ asset_tag: string }[]>`
        select asset_tag from equipment
        where tenant_id = ${suporte}::uuid and updated_at = now()::timestamp(3)
        order by asset_tag`;
      expect(comNowDaTransacao.map((linha) => linha.asset_tag)).toEqual(TROCADOS);
      const outras = depois.filter((linha) => !TROCADOS.includes(linha.assetTag));
      for (const linha of outras) expect(linha.updatedAt).toEqual(ANTES);

      expect(await linhas(outroTenant)).toEqual(antesOutro);
      expect(
        await tx.equipment.count({ where: { tenantId: { in: [suporte, outroTenant] } } }),
      ).toBe(24);
    });
  });
});
