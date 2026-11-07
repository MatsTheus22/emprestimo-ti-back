import { z } from 'zod';

// ADR-001 §4: toda lista é paginada por cursor.
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// O `min(1)` não é detalhe: um `z.string().nullable()` puro sai do gerador como
// `type: ["string", "null"]`, que o OpenAPI 3.0 não aceita e o @nestjs/swagger lê como
// lista. Com ele, sai `type: string` e `nullable: true`. Vale para todo campo anulável.
export const nextCursorSchema = z.string().min(1).nullable();
