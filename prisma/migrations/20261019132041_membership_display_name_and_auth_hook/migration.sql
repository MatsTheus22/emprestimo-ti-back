-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "display_name" TEXT NOT NULL DEFAULT '';

-- SQL bruto: objetos não cobertos pelo Prisma (ADR-001 §5).

-- Supabase: o `prisma migrate reset` recria o schema public e apaga os
-- grants padrão; em produção (migrate deploy) eles existem. Explicitar
-- aqui deixa reset e deploy iguais. RLS deny-by-default continua valendo.
-- Vem antes do hook para o REVOKE dele prevalecer.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- A tabela de controle do Prisma fica no public sem RLS: com os grants
-- acima, anon/authenticated poderiam ler e alterar pelo PostgREST. RLS
-- sem policy = ninguém além do dono (Prisma) acessa.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

-- Custom access token hook do Supabase Auth (spec 002, CA-01).
-- ADR-001 §6: o tenant vem de claim do JWT. O Auth chama esta função antes
-- de emitir cada token; ela copia tenant_id e papel da membership para os
-- claims. O papel vai em `app_role` porque `role` é claim reservado do
-- Supabase (papel do Postgres usado pelo PostgREST).
CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  m record;
  claims jsonb := event->'claims';
BEGIN
  SELECT tenant_id, role INTO m FROM public.memberships
    WHERE user_id = (event->>'user_id')::uuid LIMIT 1;
  IF FOUND THEN
    claims := claims || jsonb_build_object('tenant_id', m.tenant_id, 'app_role', m.role);
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END $$;

-- Só o Auth executa o hook; ninguém mais chama a função.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- O Auth lê a membership sem claims de tenant (o token ainda não existe),
-- então precisa de uma policy própria; a memberships_isolation o bloquearia.
GRANT SELECT ON public.memberships TO supabase_auth_admin;
CREATE POLICY "memberships_auth_hook_read" ON public.memberships
  FOR SELECT TO supabase_auth_admin USING (true);
