// Valores falsos e válidos para os testes não dependerem do .env da máquina.
// O banco aponta para uma porta morta de propósito: teste que tocar no banco
// sem usar o container do Testcontainers falha, em vez de escrever no
// Supabase local de desenvolvimento.
const NO_DATABASE = 'postgresql://testes-sem-banco@127.0.0.1:1/nenhum';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: NO_DATABASE,
  DIRECT_URL: NO_DATABASE,
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1',
  SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  CORS_ORIGIN: 'http://localhost:5173',
});
