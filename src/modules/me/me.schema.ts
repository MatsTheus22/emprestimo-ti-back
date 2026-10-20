import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Spec 002 CA-02: resposta de GET /v1/me. Também é o contrato que o
// front recebe via OpenAPI → orval.
export const MeSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  role: z.enum(['colaborador', 'operacoes']),
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
});

export type Me = z.input<typeof MeSchema>;

export class MeDto extends createZodDto(MeSchema) {}
