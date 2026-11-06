import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nextCursorSchema, paginationQuerySchema } from '../../common/pagination';

// O usuário e o tenant vêm só do token (ADR-001 §6): campos a mais são descartados.
export class CreateLoanDto extends createZodDto(z.object({ equipmentId: z.uuid() })) {}

export const LoanSchema = z.object({
  id: z.uuid(),
  equipment: z.object({
    id: z.uuid(),
    assetTag: z.string(),
    name: z.string(),
    category: z.enum(['notebook', 'monitor', 'cabo', 'camera']),
  }),
  borrowedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
});

export type Loan = z.input<typeof LoanSchema>;

export class LoanDto extends createZodDto(LoanSchema) {}

// O cursor é o id do último empréstimo da página: precisa ser uuid.
export class ListMyLoansQueryDto extends createZodDto(
  paginationQuerySchema.extend({ cursor: z.uuid().optional() }),
) {}

export const MyLoansSchema = z.object({
  items: z.array(LoanSchema.extend({ overdue: z.boolean() })),
  nextCursor: nextCursorSchema,
  totals: z.object({ open: z.number().int(), overdue: z.number().int() }),
});

export type MyLoans = z.input<typeof MyLoansSchema>;

export class MyLoansDto extends createZodDto(MyLoansSchema) {}
