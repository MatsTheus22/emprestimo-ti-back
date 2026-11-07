import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { NO_ACCESS_MESSAGE } from '../auth/auth.guard';
import { MeService } from '../me/me.service';
import { emprestimoEmAtraso, equipamentoIndisponivel, limiteAtingido } from './loans.errors';
import { LoanRow, LoansRepository } from './loans.repository';
import type { Loan, MyLoans } from './loans.schema';

@Injectable()
export class LoansService {
  constructor(
    private readonly repository: LoansRepository,
    private readonly me: MeService,
  ) {}

  async listMine({ cursor, limit }: { cursor?: string; limit: number }): Promise<MyLoans> {
    // Membership removida depois de emitido o token: 403, como em GET /v1/me.
    await this.me.get();
    const { userId, tenantId } = RequestContext.auth();

    const agora = new Date();
    // Um a mais que o pedido: é assim que se sabe se existe próxima página.
    const [rows, totals] = await Promise.all([
      this.repository.listOpen({ tenantId, userId, cursor, take: limit + 1 }),
      this.repository.openTotals(tenantId, userId, agora),
    ]);
    const page = rows.slice(0, limit);

    return {
      items: page.map((row) => ({ ...toLoan(row), overdue: row.dueAt < agora })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      totals,
    };
  }

  async create(equipmentId: string): Promise<Loan> {
    const { userId, tenantId } = RequestContext.auth();
    const result = await this.repository.create({ tenantId, userId, equipmentId });

    switch (result.outcome) {
      case 'created':
        return toLoan(result.loan);
      case 'no-membership':
        throw new ForbiddenException(NO_ACCESS_MESSAGE);
      case 'not-found':
        throw new NotFoundException('Equipamento não encontrado.');
      case 'overdue':
        throw emprestimoEmAtraso();
      case 'limit':
        throw limiteAtingido();
      case 'unavailable':
        throw equipamentoIndisponivel();
    }
  }
}

function toLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    equipment: {
      ...row.equipment,
      // O CHECK de category garante os valores do enum.
      category: row.equipment.category as Loan['equipment']['category'],
    },
    borrowedAt: row.borrowedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
  };
}
