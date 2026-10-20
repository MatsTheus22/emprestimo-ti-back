import { assertLocalSupabase, DEMO_USERS } from '../prisma/seed-demo';

// Spec 001 CA-03: seed-demo só roda contra o Supabase local.

describe('seed-demo', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321'])(
    'test_ca_03_aceita_supabase_local_%s',
    (url) => {
      expect(() => assertLocalSupabase(url)).not.toThrow();
    },
  );

  it('test_ca_03_recusa_supabase_remoto', () => {
    expect(() => assertLocalSupabase('https://abcd1234.supabase.co')).toThrow(
      /só roda contra o Supabase local/,
    );
  });

  it('test_ca_03_cria_cinco_colaboradores_e_um_de_operacoes', () => {
    const roles = DEMO_USERS.map((user) => user.role);

    expect(roles.filter((role) => role === 'colaborador')).toHaveLength(5);
    expect(roles.filter((role) => role === 'operacoes')).toHaveLength(1);
  });
});
