import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

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
