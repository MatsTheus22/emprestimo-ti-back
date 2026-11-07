import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nextCursorSchema, paginationQuerySchema } from '../../common/pagination';

export class ListEquipmentQueryDto extends createZodDto(paginationQuerySchema) {}

// Spec 004 CA-06: nada aqui identifica quem está com um item de outra pessoa.
// `myLoan` só existe para o empréstimo aberto de quem pergunta.
export const EquipmentListSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      assetTag: z.string(),
      name: z.string(),
      category: z.enum(['notebook', 'monitor', 'cabo', 'camera']),
      status: z.enum(['disponivel', 'emprestado', 'manutencao']),
      // min(1): ver o comentário em common/pagination.ts.
      imagePath: z.string().min(1).nullable(),
      myLoan: z.object({ dueAt: z.iso.datetime() }).nullable(),
    }),
  ),
  nextCursor: nextCursorSchema,
  totals: z.object({ total: z.number().int(), available: z.number().int() }),
});

export type EquipmentList = z.input<typeof EquipmentListSchema>;

export class EquipmentListDto extends createZodDto(EquipmentListSchema) {}
