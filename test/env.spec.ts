import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { InvalidEnvError, loadEnv } from '../src/config/env';

const valid = { ...process.env };

describe('loadEnv', () => {
  it('test_ca_06_env_valida_carrega_e_aplica_defaults', () => {
    const env = loadEnv({ ...valid, PORT: undefined });

    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('test_ca_06_variavel_ausente_falha_nomeando_a_variavel', () => {
    const semDatabaseUrl = { ...valid };
    delete semDatabaseUrl.DATABASE_URL;

    expect(() => loadEnv(semDatabaseUrl)).toThrow(InvalidEnvError);
    expect(() => loadEnv(semDatabaseUrl)).toThrow(/DATABASE_URL/);
  });

  it('test_ca_06_variavel_vazia_ou_invalida_falha_nomeando_a_variavel', () => {
    const run = () =>
      loadEnv({ ...valid, CORS_ORIGIN: 'nao-e-url', SUPABASE_SERVICE_ROLE_KEY: '' });

    expect(run).toThrow(/CORS_ORIGIN/);
    expect(run).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('boot da aplicação', () => {
  afterEach(() => {
    process.env.CORS_ORIGIN = valid.CORS_ORIGIN;
  });

  it('test_ca_06_app_nao_sobe_com_env_invalida', async () => {
    delete process.env.CORS_ORIGIN;

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /CORS_ORIGIN/,
    );
  });
});
