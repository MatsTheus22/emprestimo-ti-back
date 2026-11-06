import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { MeService } from '../me/me.service';
import { EquipmentRepository, EquipmentRow } from './equipment.repository';
import type { EquipmentList } from './equipment.schema';

type Item = EquipmentList['items'][number];

@Injectable()
export class EquipmentService {
  constructor(
    private readonly repository: EquipmentRepository,
    private readonly me: MeService,
  ) {}

  async list({ cursor, limit }: { cursor?: string; limit: number }): Promise<EquipmentList> {
    // Membership removida depois de emitido o token: 403, como em GET /v1/me.
    await this.me.get();
    const { userId, tenantId } = RequestContext.auth();

    // Um a mais que o pedido: é assim que se sabe se existe próxima página.
    const [rows, totals] = await Promise.all([
      this.repository.list({ tenantId, userId, cursor, take: limit + 1 }),
      this.repository.totals(tenantId),
    ]);
    const page = rows.slice(0, limit);

    return {
      items: page.map(toItem),
      nextCursor: rows.length > limit ? (page.at(-1)?.assetTag ?? null) : null,
      totals,
    };
  }
}

function toItem({ loans, ...row }: EquipmentRow): Item {
  const [myLoan] = loans;
  return {
    ...row,
    // Os CHECKs de category e status garantem os valores do enum.
    category: row.category as Item['category'],
    status: row.status as Item['status'],
    myLoan: myLoan ? { dueAt: myLoan.dueAt.toISOString() } : null,
  };
}
