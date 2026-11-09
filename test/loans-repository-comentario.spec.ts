import { readFileSync } from 'node:fs';
import path from 'node:path';

// Spec 005 CA-10: o comentário das opções da transação deixa de citar a travessia até São
// Paulo, e as opções continuam as mesmas.

const COMENTARIO =
  '// Com connection_limit=1, um pedido pode esperar o outro: os padrões do Prisma (2 s e 5 s) virariam erro 500.';
const OPCOES = 'const OPCOES_DA_TRANSACAO = { maxWait: 10_000, timeout: 15_000 };';

const arquivo = readFileSync(
  path.resolve(__dirname, '..', 'src', 'modules', 'loans', 'loans.repository.ts'),
  'utf8',
);
const linhas = arquivo.split(/\r?\n/);

describe('comentário das opções da transação', () => {
  it('test_ca_10_comentario_e_o_texto_decidido_logo_acima_das_opcoes', () => {
    expect(linhas[linhas.indexOf(OPCOES) - 1]).toBe(COMENTARIO);
  });

  // O fuso do negócio, no cálculo do prazo, continua citando São Paulo: é outra coisa.
  it('test_ca_10_comentario_nao_cita_a_travessia_ate_sao_paulo', () => {
    expect(arquivo).not.toMatch(/cruza dos|EUA até São Paulo/);
  });
});
