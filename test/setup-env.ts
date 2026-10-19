// Valores falsos e válidos para os testes não dependerem do .env da máquina.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1',
  SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  CORS_ORIGIN: 'http://localhost:5173',
});
