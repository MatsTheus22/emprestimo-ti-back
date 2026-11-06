import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { DEFAULT_TENANT } from './seed';
import { ambienteDoProcesso, Ambiente, resolverUrl, semUrlDeConexao } from './seed-iniciais';

// Spec 004: apaga os empréstimos de uma conta de teste e devolve os equipamentos à
// situação disponível. Em produção, só o usuário roda (rules/restrictions.md). O e-mail
// da conta vem de --email: não fica no código nem no repositório.

// O professor testa o sistema com esta conta, que precisa continuar com zero empréstimos.
export const CONTA_PROTEGIDA = 'marcelo.grilo@institutojef.org.br';

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

export function exigirContaPermitida(email: string | undefined): string {
  const normalizado = normalizar(email ?? '');
  if (!normalizado) throw new Error('Informe a conta de teste com --email.');
  if (normalizado === CONTA_PROTEGIDA) {
    throw new Error('Esta é a conta protegida: o script nunca apaga os empréstimos dela.');
  }
  return normalizado;
}

// A conta é conferida antes do alvo: com a conta protegida, nem chega a pedir o ref.
export async function prepararExecucao(
  { alvo, email }: { alvo?: string; email?: string },
  ambiente: Ambiente,
): Promise<{ url: string; email: string }> {
  const conta = exigirContaPermitida(email);
  return { url: await resolverUrl(alvo, ambiente), email: conta };
}

export async function confirmarEmail(
  email: string,
  perguntar: (texto: string) => Promise<string>,
): Promise<void> {
  const digitado = await perguntar(`Digite o e-mail (${email}) para confirmar: `);
  if (normalizar(digitado) !== email) throw new Error('Confirmação não confere. Nada foi apagado.');
}

export async function acharConta(
  prisma: PrismaClient,
  email: string,
): Promise<{ id: string; email: string }> {
  // Igualdade, não LIKE: `%` não pode casar com conta nenhuma.
  const contas = await prisma.$queryRaw<{ id: string; email: string }[]>`
    select id::text as id, email from auth.users where lower(email) = ${normalizar(email)}`;
  const [conta] = contas;
  if (!conta) throw new Error('Esta conta não existe. Nada foi apagado.');
  if (contas.length > 1) throw new Error('Mais de uma conta com este e-mail. Nada foi apagado.');
  exigirContaPermitida(conta.email);
  return conta;
}

export interface EmprestimoDaConta {
  equipmentId: string;
  assetTag: string;
  name: string;
  borrowedAt: Date;
  dueAt: Date;
  aberto: boolean;
}

export async function emprestimosDaConta(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<EmprestimoDaConta[]> {
  const linhas = await prisma.loan.findMany({
    where: { tenantId, userId },
    orderBy: { borrowedAt: 'asc' },
    select: {
      equipmentId: true,
      borrowedAt: true,
      dueAt: true,
      returnedAt: true,
      equipment: { select: { assetTag: true, name: true } },
    },
  });
  return linhas.map(({ equipment, returnedAt, ...linha }) => ({
    ...linha,
    ...equipment,
    aberto: returnedAt === null,
  }));
}

export async function limparEmprestimos(
  prisma: PrismaClient,
  { tenantId, userId, confirmados }: { tenantId: string; userId: string; confirmados: number },
): Promise<{ apagados: number; devolvidos: number }> {
  return prisma.$transaction(
    async (tx) => {
      const daConta = { tenantId, userId };
      const emprestimos = await tx.loan.findMany({
        where: daConta,
        select: { equipmentId: true, returnedAt: true },
      });
      if (emprestimos.length !== confirmados) {
        throw new Error('Os empréstimos da conta mudaram desde a confirmação. Nada foi apagado.');
      }

      const { count: apagados } = await tx.loan.deleteMany({ where: daConta });

      // Só o que estava com a conta. Em manutenção, ou de empréstimo já devolvido, fica.
      const abertos = emprestimos.filter((emprestimo) => emprestimo.returnedAt === null);
      const { count: devolvidos } = await tx.equipment.updateMany({
        where: {
          tenantId,
          id: { in: abertos.map((emprestimo) => emprestimo.equipmentId) },
          status: 'emprestado',
        },
        data: { status: 'disponivel' },
      });

      return { apagados, devolvidos };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function resumoFinal(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ daContaProtegida: number; porSituacao: Record<string, number> }> {
  const [linha] = await prisma.$queryRaw<{ total: bigint }[]>`
    select count(*) as total from loans l
    join auth.users u on u.id = l.user_id
    where l.tenant_id = ${tenantId}::uuid and lower(u.email) = ${CONTA_PROTEGIDA}`;
  const situacoes = await prisma.equipment.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
    orderBy: { status: 'asc' },
  });
  return {
    daContaProtegida: Number(linha?.total ?? 0),
    porSituacao: Object.fromEntries(situacoes.map(({ status, _count }) => [status, _count])),
  };
}

const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { alvo: { type: 'string' }, email: { type: 'string' } },
  });
  const ambiente = ambienteDoProcesso();
  const { url, email } = await prepararExecucao(values, ambiente);

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const conta = await acharConta(prisma, email);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: DEFAULT_TENANT.slug },
      select: { id: true },
    });

    const lista = await emprestimosDaConta(prisma, tenant.id, conta.id);
    if (lista.length > 0) {
      console.log(`Empréstimos que serão apagados (${lista.length}):`);
      for (const item of lista) {
        const devolucao = item.aberto ? `devolver até ${DATA.format(item.dueAt)}` : 'já devolvido';
        console.log(
          `  ${item.assetTag} · ${item.name} · retirada ${DATA.format(item.borrowedAt)} · ${devolucao}`,
        );
      }
      await confirmarEmail(email, ambiente.perguntar);
    }

    const { apagados, devolvidos } = await limparEmprestimos(prisma, {
      tenantId: tenant.id,
      userId: conta.id,
      confirmados: lista.length,
    });
    console.log(`apagados: ${apagados} · devolvidos: ${devolvidos}`);

    const { daContaProtegida, porSituacao } = await resumoFinal(prisma, tenant.id);
    console.log(`Conta protegida: ${daContaProtegida} empréstimos`);
    console.log(`Equipamentos por situação: ${JSON.stringify(porSituacao)}`);
    if (daContaProtegida > 0) {
      console.error('ATENÇÃO: a conta protegida deveria ter zero empréstimos.');
      process.exitCode = 1;
    }
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
