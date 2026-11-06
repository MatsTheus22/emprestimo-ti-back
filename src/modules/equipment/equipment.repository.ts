import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EquipmentRow {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  status: string;
  imagePath: string | null;
  loans: { dueAt: Date }[];
}

export interface ListParams {
  tenantId: string;
  userId: string;
  cursor?: string;
  take: number;
}

@Injectable()
export class EquipmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // O filtro de `loans` é por usuário: o empréstimo de outra pessoa nunca sai do banco.
  list({ tenantId, userId, cursor, take }: ListParams): Promise<EquipmentRow[]> {
    return this.prisma.equipment.findMany({
      where: { tenantId, ...(cursor ? { assetTag: { gt: cursor } } : {}) },
      orderBy: { assetTag: 'asc' },
      take,
      select: {
        id: true,
        assetTag: true,
        name: true,
        category: true,
        status: true,
        imagePath: true,
        loans: {
          where: { tenantId, userId, returnedAt: null },
          select: { dueAt: true },
        },
      },
    });
  }

  async totals(tenantId: string): Promise<{ total: number; available: number }> {
    const [total, available] = await Promise.all([
      this.prisma.equipment.count({ where: { tenantId } }),
      this.prisma.equipment.count({ where: { tenantId, status: 'disponivel' } }),
    ]);
    return { total, available };
  }
}
