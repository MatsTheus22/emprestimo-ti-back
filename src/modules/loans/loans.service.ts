import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { NO_ACCESS_MESSAGE } from '../auth/auth.guard';
import { emprestimoEmAtraso, equipamentoIndisponivel, limiteAtingido } from './loans.errors';
import { LoanRow, LoansRepository } from './loans.repository';
import type { Loan } from './loans.schema';

@Injectable()
export class LoansService {
  constructor(private readonly repository: LoansRepository) {}

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
