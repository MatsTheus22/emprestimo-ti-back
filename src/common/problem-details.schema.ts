import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// RFC 9457 — o formato que o ProblemDetailsFilter devolve em todo erro.
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string(),
  errors: z.unknown().optional(),
});

export class ProblemDetailsDto extends createZodDto(ProblemDetailsSchema) {}
