import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  Ambiente,
  exigirBancoLocal,
  exigirCondicoesDeProducao,
  refDoProjeto,
  resolverUrl,
  semUrlDeConexao,
} from '../prisma/seed-iniciais';

// Spec 003 CA-05: o script recusa apontar para o alvo errado.

const LOCAL = 'postgresql://postgres:x@127.0.0.1:54322/postgres';
const DIRETA = 'postgresql://postgres:x@db.abcd1234.supabase.co:5432/postgres';
const POOLER = 'postgresql://postgres.abcd1234:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
const RAIZ = path.resolve(__dirname, '..');

function ambiente(sobre: Partial<Ambiente> = {}): Ambiente {
  return {
    env: {},
    isTTY: true,
    carregarArquivoEnv: jest.fn(),
    perguntar: jest.fn(() => Promise.resolve('abcd1234')),
    avisar: jest.fn(),
    ...sobre,
  };
}

function rodarScript(args: string[], databaseUrl: string) {
  return spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', 'prisma/seed-iniciais.ts', ...args],
    {
      cwd: RAIZ,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
      input: '',
      timeout: 30_000,
    },
  );
}

describe('alvo local', () => {
  it.each([LOCAL, 'postgresql://postgres:x@localhost:54322/postgres'])(
    'test_ca_05_aceita_banco_local_%s',
    (url) => {
      expect(exigirBancoLocal(url)).toBe(url);
    },
  );

  it.each([DIRETA, POOLER])('test_ca_05_recusa_host_remoto_%s', (url) => {
    expect(() => exigirBancoLocal(url)).toThrow(/--alvo local recusa o host/);
  });

  it('test_ca_05_recusa_rodar_sem_database_url', () => {
    expect(() => exigirBancoLocal(undefined)).toThrow(/DATABASE_URL não definida/);
  });

  it('test_ca_05_le_o_arquivo_env_so_no_alvo_local', async () => {
    const local = ambiente({ env: { DATABASE_URL: LOCAL } });

    await expect(resolverUrl('local', local)).resolves.toBe(LOCAL);
    expect(local.carregarArquivoEnv).toHaveBeenCalledTimes(1);
  });
});

describe('alvo producao', () => {
  it('test_ca_05_exige_terminal_interativo', () => {
    expect(() => exigirCondicoesDeProducao(false, DIRETA)).toThrow(/terminal interativo/);
  });

  it('test_ca_05_exige_database_url_do_processo', () => {
    expect(() => exigirCondicoesDeProducao(true, undefined)).toThrow(/só do processo/);
  });

  it('test_ca_05_recusa_host_local', () => {
    expect(() => exigirCondicoesDeProducao(true, LOCAL)).toThrow(/recusa host local/);
  });

  it.each([DIRETA, POOLER])('test_ca_05_extrai_o_ref_do_projeto_%s', (url) => {
    expect(refDoProjeto(url)).toBe('abcd1234');
  });

  it.each([
    'postgresql://postgres:x@exemplo.test:5432/postgres',
    'postgresql://postgres:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.abcd1234:x@exemplo.test:6543/postgres',
  ])('test_ca_05_recusa_host_que_nao_e_do_supabase_%s', (url) => {
    expect(() => refDoProjeto(url)).toThrow(/não é de um projeto Supabase/);
  });

  it('test_ca_05_com_o_ref_certo_devolve_a_url_sem_ler_arquivo', async () => {
    const producao = ambiente({ env: { DATABASE_URL: POOLER } });

    await expect(resolverUrl('producao', producao)).resolves.toBe(POOLER);
    expect(producao.carregarArquivoEnv).not.toHaveBeenCalled();
    expect(producao.avisar).toHaveBeenCalledWith('Destino: aws-0-sa-east-1.pooler.supabase.com');
  });

  it('test_ca_05_com_o_ref_errado_nao_devolve_a_url', async () => {
    const producao = ambiente({
      env: { DATABASE_URL: DIRETA },
      perguntar: () => Promise.resolve('outro'),
    });

    await expect(resolverUrl('producao', producao)).rejects.toThrow(/Nada foi gravado/);
  });

  it('test_ca_05_sem_database_url_no_processo_nao_recorre_ao_arquivo', async () => {
    const producao = ambiente();

    await expect(resolverUrl('producao', producao)).rejects.toThrow(/só do processo/);
    expect(producao.carregarArquivoEnv).not.toHaveBeenCalled();
    expect(producao.perguntar).not.toHaveBeenCalled();
  });
});

describe('script de ponta a ponta', () => {
  it('test_ca_05_sem_alvo_recusa', () => {
    const saida = rodarScript([], LOCAL);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/Informe --alvo local ou --alvo producao/);
  });

  it('test_ca_05_sem_terminal_recusa_producao', () => {
    const saida = rodarScript(['--alvo', 'producao'], DIRETA);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/terminal interativo/);
  });

  it('test_ca_05_alvo_local_recusa_database_url_remota', () => {
    const saida = rodarScript(['--alvo', 'local'], POOLER);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/--alvo local recusa o host/);
    expect(saida.stderr).not.toContain(POOLER);
  });
});

describe('segredos', () => {
  it('test_ca_05_mensagem_de_erro_nao_traz_a_url_de_conexao', () => {
    const texto = semUrlDeConexao(`falhou em ${POOLER} ao conectar`);

    expect(texto).toBe('falhou em <url omitida> ao conectar');
  });

  it('test_ca_05_env_example_tem_as_chaves_sem_valor', () => {
    const exemplo = readFileSync(path.join(RAIZ, '.env.example'), 'utf8');

    expect(exemplo).toMatch(/^PIXABAY_API_KEY=\s*$/m);
    expect(exemplo).toMatch(/^DATABASE_URL=\s*$/m);
  });
});
