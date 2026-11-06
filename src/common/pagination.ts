import { z } from 'zod';

// ADR-001 §4: toda lista é paginada por cursor.
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
