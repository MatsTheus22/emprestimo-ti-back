import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatarResultado } from '../prisma/seed-iniciais';

// Spec 003 CA-03 e CA-04: o que o script informa e o que ele não pode conter.

const PRISMA = path.resolve(__dirname, '..', 'prisma');
const script = readFileSync(path.join(PRISMA, 'seed-iniciais.ts'), 'utf8');
const dados = readFileSync(path.join(PRISMA, 'dados', 'equipamentos-iniciais.json'), 'utf8');

describe('seed-iniciais', () => {
  it('test_ca_03_informa_criadas_ja_existentes_e_total', () => {
    expect(formatarResultado({ criadas: 0, jaExistiam: 12, total: 12 })).toBe(
      'criadas: 0 · já existiam: 12 · total: 12',
    );
  });

  it.each([
    ['script', script],
    ['arquivo de dados', dados],
  ])('test_ca_04_%s_nao_contem_senha', (_nome, conteudo) => {
    expect(conteudo).not.toMatch(/password|senha|DEMO_SEED/i);
  });

  it('test_ca_04_script_so_escreve_em_equipamentos_e_tenant', () => {
    expect(script).not.toMatch(/\.loan\b|\.membership\b|auth\.|createUser|\$executeRaw/);
  });
});
