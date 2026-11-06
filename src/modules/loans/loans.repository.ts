import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FUSO_DO_NEGOCIO, LIMITE_EMPRESTIMOS, PRAZO_DIAS } from './loans.rules';

export interface LoanRow {
  id: string;
  borrowedAt: Date;
  dueAt: Date;
  equipment: { id: string; assetTag: string; name: string; category: string };
}

export type CreateLoanResult =
  | { outcome: 'created'; loan: LoanRow }
  | { outcome: 'no-membership' | 'not-found' | 'overdue' | 'limit' | 'unavailable' };

const UNIQUE_VIOLATION = 'P2002';

// Com connection_limit=1, um pedido pode esperar o outro, e cada query cruza dos
// EUA até São Paulo (ADR-001 §9): os padrões do Prisma (2 s e 5 s) virariam erro 500.
const OPCOES_DA_TRANSACAO = { maxWait: 10_000, timeout: 15_000 };

@Injectable()
export class LoansRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Tudo ou nada. As recusas devolvem antes de qualquer escrita; o que falha depois
  // de uma escrita lança exceção, e o Prisma desfaz a transação.
  async create(params: {
    tenantId: string;
    userId: string;
    equipmentId: string;
  }): Promise<CreateLoanResult> {
    try {
      return await this.prisma.$transaction(
        (tx) => this.createInTransaction(tx, params),
        OPCOES_DA_TRANSACAO,
      );
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'unavailable' };
      throw error;
    }
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    { tenantId, userId, equipmentId }: { tenantId: string; userId: string; equipmentId: string },
  ): Promise<CreateLoanResult> {
    // Serializa os pedidos da mesma pessoa: é o que torna atômica a conferência do
    // limite. A ordem é sempre membership e depois equipamento, então não há deadlock.
    const membership = await tx.$queryRaw<unknown[]>`
      select 1 from memberships
      where user_id = ${userId}::uuid and tenant_id = ${tenantId}::uuid
      for update`;
    if (membership.length === 0) return { outcome: 'no-membership' };

    const equipment = await tx.equipment.findFirst({
      where: { id: equipmentId, tenantId },
      select: { id: true },
    });
    if (!equipment) return { outcome: 'not-found' };

    const agora = new Date();
    const abertos = { tenantId, userId, returnedAt: null };
    const emAtraso = await tx.loan.count({ where: { ...abertos, dueAt: { lt: agora } } });
    if (emAtraso > 0) return { outcome: 'overdue' };
    const emAberto = await tx.loan.count({ where: abertos });
    if (emAberto >= LIMITE_EMPRESTIMOS) return { outcome: 'limit' };

    // Dois pedidos ao mesmo equipamento se serializam aqui: o segundo vê zero linhas.
    const { count } = await tx.equipment.updateMany({
      where: { id: equipmentId, tenantId, status: 'disponivel' },
      data: { status: 'emprestado' },
    });
    if (count === 0) return { outcome: 'unavailable' };

    const loan = await tx.loan.create({
      data: {
        tenantId,
        userId,
        equipmentId,
        borrowedAt: agora,
        dueAt: await this.calcularDevolucao(tx, agora),
      },
      select: {
        id: true,
        borrowedAt: true,
        dueAt: true,
        equipment: { select: { id: true, assetTag: true, name: true, category: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'loan.create',
        resource: 'loan',
        resourceId: loan.id,
        metadata: { equipmentId },
      },
    });

    return { outcome: 'created', loan };
  }

  // Fim do último dia do prazo em São Paulo. O `at time zone 'UTC'` final é necessário:
  // a coluna é TIMESTAMP(3) em UTC, e sem ele o valor sairia no fuso da sessão.
  async calcularDevolucao(tx: Prisma.TransactionClient, instante: Date): Promise<Date> {
    const [linha] = await tx.$queryRaw<{ due_at: Date }[]>`
      select ${devolucaoSql(instante)} as due_at`;
    if (!linha) throw new Error('O cálculo da devolução não retornou linha');
    return linha.due_at;
  }
}

// Exportada para o teste gravar a fórmula direto na coluna, que é onde o fuso da
// sessão desloca o valor se a conversão para UTC faltar.
export function devolucaoSql(instante: Date): Prisma.Sql {
  return Prisma.sql`(
    ((${instante}::timestamptz at time zone ${FUSO_DO_NEGOCIO})::date + ${PRAZO_DIAS + 1}::int)::timestamp
      at time zone ${FUSO_DO_NEGOCIO} - interval '1 millisecond'
  ) at time zone 'UTC'`;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}
