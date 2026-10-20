import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createSuperuserTestPrisma, createTestPrisma } from './test-database';

// Spec 002 CA-01: o hook que o Supabase Auth chama antes de emitir o token
// copia tenant_id e app_role da membership para os claims. Os testes rodam
// com o papel supabase_auth_admin, que é quem o Auth usa de verdade.

const TENANT = randomUUID();
const USER_WITH_MEMBERSHIP = randomUUID();
const USER_WITHOUT_MEMBERSHIP = randomUUID();

type HookEvent = { user_id: string; claims: Record<string, unknown> };

let prisma: PrismaService;
// Só o superusuário pode assumir supabase_auth_admin; o `set local role`
// abaixo faz a chamada rodar com as permissões exatas desse papel.
let superuser: PrismaService;

function eventFor(userId: string): HookEvent {
  return { user_id: userId, claims: { sub: userId, role: 'authenticated', aal: 'aal1' } };
}

async function runHookAs(role: string, event: HookEvent): Promise<HookEvent> {
  return superuser.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`set local role ${role}`);
    const [row] = await tx.$queryRaw<{ result: HookEvent }[]>`
      select public.custom_access_token_hook(${JSON.stringify(event)}::jsonb) as result`;
    if (!row) throw new Error('hook não retornou linha');
    return row.result;
  });
}

beforeAll(async () => {
  prisma = createTestPrisma();
  superuser = createSuperuserTestPrisma();
  for (const id of [USER_WITH_MEMBERSHIP, USER_WITHOUT_MEMBERSHIP]) {
    await prisma.$executeRaw`insert into auth.users (id, email) values (${id}::uuid, ${id + '@test.local'})`;
  }
  await prisma.tenant.create({ data: { id: TENANT, slug: 'hook_' + TENANT, name: 'Hook' } });
  await prisma.membership.create({
    data: { userId: USER_WITH_MEMBERSHIP, tenantId: TENANT, role: 'operacoes' },
  });
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), superuser.$disconnect()]);
});

describe('custom_access_token_hook', () => {
  it('test_ca_01_usuario_com_membership_recebe_tenant_id_e_app_role', async () => {
    const result = await runHookAs('supabase_auth_admin', eventFor(USER_WITH_MEMBERSHIP));

    expect(result.claims).toEqual({
      sub: USER_WITH_MEMBERSHIP,
      role: 'authenticated',
      aal: 'aal1',
      tenant_id: TENANT,
      app_role: 'operacoes',
    });
  });

  it('test_ca_01_usuario_sem_membership_recebe_claims_sem_tenant', async () => {
    const event = eventFor(USER_WITHOUT_MEMBERSHIP);

    const result = await runHookAs('supabase_auth_admin', event);

    expect(result.claims).toEqual(event.claims);
  });

  it('test_ca_01_usuario_logado_nao_pode_chamar_o_hook', async () => {
    await expect(runHookAs('authenticated', eventFor(USER_WITH_MEMBERSHIP))).rejects.toThrow(
      /permission denied/,
    );
  });
});
