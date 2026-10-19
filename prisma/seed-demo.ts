import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { loadEnv } from '../src/config/env';
import { seedTenant } from './seed';

// Spec 001 CA-03: usuários de demonstração (layout.md §9) para desenvolver
// e testar o login. Só roda contra o Supabase local: a senha é fixa e
// pública, então nunca pode existir num ambiente real.
export const DEMO_PASSWORD = 'emprestai-dev';

export const DEMO_USERS = [
  { email: 'ana.ribeiro@emprestai.local', displayName: 'Ana Ribeiro', role: 'colaborador' },
  { email: 'marcos.lemos@emprestai.local', displayName: 'Marcos Lemos', role: 'colaborador' },
  { email: 'julia.prado@emprestai.local', displayName: 'Júlia Prado', role: 'colaborador' },
  { email: 'rafael.souza@emprestai.local', displayName: 'Rafael Souza', role: 'colaborador' },
  { email: 'camila.nunes@emprestai.local', displayName: 'Camila Nunes', role: 'colaborador' },
  { email: 'operacoes@emprestai.local', displayName: 'Operações TI', role: 'operacoes' },
] as const;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertLocalSupabase(supabaseUrl: string): void {
  const { hostname } = new URL(supabaseUrl);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `seed-demo só roda contra o Supabase local; SUPABASE_URL aponta para "${hostname}".`,
    );
  }
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
}

async function ensureUser(admin: SupabaseClient, email: string): Promise<string> {
  const existing = await findUserIdByEmail(admin, email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv();
  assertLocalSupabase(env.SUPABASE_URL);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

  try {
    const tenant = await seedTenant(prisma);
    for (const demo of DEMO_USERS) {
      const userId = await ensureUser(admin, demo.email);
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId, tenantId: tenant.id } },
        update: { role: demo.role, displayName: demo.displayName },
        create: { userId, tenantId: tenant.id, role: demo.role, displayName: demo.displayName },
      });
      console.log(`${demo.role.padEnd(11)} ${demo.email}`);
    }
    console.log(`senha de todos: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
