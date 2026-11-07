import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONTA_PROTEGIDA,
  confirmarEmail,
  exigirContaPermitida,
  prepararExecucao,
} from '../prisma/limpar-emprestimos-teste';
import type { Ambiente } from '../prisma/seed-iniciais';

// Spec 004 CA-17 e CA-18: o script recusa a conta protegida e o alvo errado.
// Estes testes não abrem conexão com banco nenhum.

const LOCAL = 'postgresql://postgres:x@127.0.0.1:54322/postgres';
const POOLER = 'postgresql://postgres.abcd1234:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
const CONTA = 'teste@exemplo.test';
const RAIZ = path.resolve(__dirname, '..');
const ARQUIVO = path.join(RAIZ, 'prisma', 'limpar-emprestimos-teste.ts');

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
    ['-r', 'ts-node/register/transpile-only', 'prisma/limpar-emprestimos-teste.ts', ...args],
    {
      cwd: RAIZ,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
      input: '',
      timeout: 30_000,
    },
  );
}

describe('conta protegida', () => {
  it.each([
    'marcelo.grilo@institutojef.org.br',
    'MARCELO.GRILO@INSTITUTOJEF.ORG.BR',
    '  Marcelo.Grilo@institutojef.org.br  ',
  ])('test_ca_17_recusa_a_conta_protegida_%s', (email) => {
    expect(() => exigirContaPermitida(email)).toThrow(/protegida/);
  });

  it('test_ca_17_recusa_em_todas_as_formas_antes_de_olhar_o_alvo', async () => {
    const producao = ambiente({ env: { DATABASE_URL: POOLER } });

    await expect(
      prepararExecucao({ alvo: 'producao', email: CONTA_PROTEGIDA.toUpperCase() }, producao),
    ).rejects.toThrow(/protegida/);
    expect(producao.perguntar).not.toHaveBeenCalled();
    expect(producao.avisar).not.toHaveBeenCalled();
  });

  it('test_ca_17_normaliza_o_email_permitido', () => {
    expect(exigirContaPermitida('  Teste@Exemplo.Test ')).toBe(CONTA);
  });

  it.each([undefined, '', '   '])('test_ca_17_exige_o_email_%j', (email) => {
    expect(() => exigirContaPermitida(email)).toThrow(/--email/);
  });

  it('test_ca_17_codigo_so_cita_o_email_da_conta_protegida', () => {
    const emails = readFileSync(ARQUIVO, 'utf8').match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);

    expect([...new Set(emails)]).toEqual([CONTA_PROTEGIDA]);
  });
});

describe('confirmação', () => {
  it('test_ca_18_confirmacao_com_o_mesmo_email_passa', async () => {
    await expect(
      confirmarEmail(CONTA, () => Promise.resolve(' Teste@exemplo.test ')),
    ).resolves.toBe(undefined);
  });

  it('test_ca_18_confirmacao_diferente_nao_passa', async () => {
    await expect(
      confirmarEmail(CONTA, () => Promise.resolve('outro@exemplo.test')),
    ).rejects.toThrow(/Nada foi apagado/);
  });

  it('test_ca_18_confirmacao_vazia_nao_passa', async () => {
    await expect(confirmarEmail(CONTA, () => Promise.resolve(''))).rejects.toThrow(
      /Nada foi apagado/,
    );
  });
});

describe('alvo', () => {
  it('test_ca_18_alvo_local_recusa_host_remoto', async () => {
    const local = ambiente({ env: { DATABASE_URL: POOLER } });

    await expect(prepararExecucao({ alvo: 'local', email: CONTA }, local)).rejects.toThrow(
      /--alvo local recusa o host/,
    );
  });

  it('test_ca_18_alvo_producao_exige_terminal_interativo', async () => {
    const semTerminal = ambiente({ env: { DATABASE_URL: POOLER }, isTTY: false });

    await expect(prepararExecucao({ alvo: 'producao', email: CONTA }, semTerminal)).rejects.toThrow(
      /terminal interativo/,
    );
  });

  it('test_ca_18_alvo_producao_le_a_url_so_do_processo', async () => {
    const semUrl = ambiente();

    await expect(prepararExecucao({ alvo: 'producao', email: CONTA }, semUrl)).rejects.toThrow(
      /só do processo/,
    );
    expect(semUrl.carregarArquivoEnv).not.toHaveBeenCalled();
  });

  it('test_ca_18_alvo_producao_recusa_host_local', async () => {
    const comLocal = ambiente({ env: { DATABASE_URL: LOCAL } });

    await expect(prepararExecucao({ alvo: 'producao', email: CONTA }, comLocal)).rejects.toThrow(
      /recusa host local/,
    );
  });

  it('test_ca_18_alvo_producao_com_o_ref_errado_nao_devolve_a_url', async () => {
    const refErrado = ambiente({
      env: { DATABASE_URL: POOLER },
      perguntar: () => Promise.resolve('outro'),
    });

    await expect(prepararExecucao({ alvo: 'producao', email: CONTA }, refErrado)).rejects.toThrow(
      /Nada foi gravado/,
    );
  });

  it('test_ca_18_alvo_producao_com_o_ref_certo_devolve_url_e_email', async () => {
    const producao = ambiente({ env: { DATABASE_URL: POOLER } });

    await expect(prepararExecucao({ alvo: 'producao', email: CONTA }, producao)).resolves.toEqual({
      url: POOLER,
      email: CONTA,
    });
    expect(producao.avisar).toHaveBeenCalledWith('Destino: aws-0-sa-east-1.pooler.supabase.com');
    expect(producao.carregarArquivoEnv).not.toHaveBeenCalled();
  });
});

describe('script de ponta a ponta, sem conectar', () => {
  it('test_ca_18_sem_alvo_recusa', () => {
    const saida = rodarScript(['--email', CONTA], LOCAL);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/Informe --alvo local ou --alvo producao/);
  });

  it('test_ca_17_sem_email_recusa', () => {
    const saida = rodarScript(['--alvo', 'local'], LOCAL);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/--email/);
  });

  it('test_ca_17_conta_protegida_recusa_e_nao_mostra_destino', () => {
    const saida = rodarScript(['--alvo', 'producao', '--email', CONTA_PROTEGIDA], POOLER);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/protegida/);
    expect(saida.stdout).not.toMatch(/Destino/);
  });

  it('test_ca_18_sem_terminal_recusa_producao', () => {
    const saida = rodarScript(['--alvo', 'producao', '--email', CONTA], POOLER);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/terminal interativo/);
  });

  it('test_ca_18_alvo_local_recusa_database_url_remota_sem_vazar_a_url', () => {
    const saida = rodarScript(['--alvo', 'local', '--email', CONTA], POOLER);

    expect(saida.status).toBe(1);
    expect(saida.stderr).toMatch(/--alvo local recusa o host/);
    expect(saida.stderr).not.toContain(POOLER);
  });

  it('test_ca_18_npm_script_existe', () => {
    const pacote = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pacote.scripts['limpar:emprestimos-teste']).toContain('limpar-emprestimos-teste.ts');
  });
});
