import { z } from 'zod';

// ADR-001 §9: configuração validada com Zod no boot. Falhar na subida é
// melhor que `undefined` virando comportamento silencioso em produção.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_ISSUER: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGIN: z.url(),
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  override readonly name = 'InvalidEnvError';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
    throw new InvalidEnvError(`Variáveis de ambiente inválidas:\n${lines.join('\n')}`);
  }
  return result.data;
}
