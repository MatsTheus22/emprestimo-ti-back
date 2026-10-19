import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

// ADR-001 §8: integração contra Postgres real. Usa a mesma imagem do
// Supabase local, porque as migrations dependem de auth.users e dos
// papéis anon/authenticated que o Postgres puro não tem.
const IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.002';
const PASSWORD = 'postgres';

declare global {
  var __PG_CONTAINER__: StartedTestContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({ POSTGRES_PASSWORD: PASSWORD })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forSuccessfulCommand('pg_isready -U postgres -h localhost'))
    .withStartupTimeout(180_000)
    .start();
  globalThis.__PG_CONTAINER__ = container;

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = `postgresql://postgres:${PASSWORD}@${host}:${port}/postgres`;

  // auth.jwt() é criada pelo GoTrue no Supabase real, não pela imagem do
  // Postgres. Mesma definição do banco local.
  const admin = new Client({
    connectionString: `postgresql://supabase_admin:${PASSWORD}@${host}:${port}/postgres`,
  });
  await admin.connect();
  await admin.query(`
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
      )::jsonb
    $$;
    grant execute on function auth.jwt() to public;
  `);
  await admin.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });

  process.env.TEST_DATABASE_URL = url;
}
