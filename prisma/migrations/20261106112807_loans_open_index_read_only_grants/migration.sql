-- Spec 004. Só SQL bruto: o Prisma não modela índice parcial, grant nem policy
-- (ADR-001 §5).

-- No máximo um empréstimo aberto por equipamento.
CREATE UNIQUE INDEX "loans_one_open_per_equipment"
  ON "loans"("equipment_id") WHERE "returned_at" IS NULL;

-- Deny by default (ADR-001 §7). O papel na membership vai para o token, então
-- escrita aqui seria escalada de privilégio. A API conecta como dona das tabelas
-- e não é afetada. TRUNCATE ignora RLS, por isso sai junto.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON "loans", "equipment", "memberships", "tenants", "audit_log", "_prisma_migrations"
  FROM anon, authenticated;

-- Tabela nova deixa de nascer com escrita para esses papéis.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;

-- As policies antigas valiam para todos os comandos: passam a valer só para leitura.
DROP POLICY "tenants_isolation" ON "tenants";
CREATE POLICY "tenants_read" ON "tenants" FOR SELECT TO authenticated
  USING ("id" = (auth.jwt() ->> 'tenant_id')::uuid);

DROP POLICY "equipment_isolation" ON "equipment";
CREATE POLICY "equipment_read" ON "equipment" FOR SELECT TO authenticated
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid);

-- A memberships_auth_hook_read continua: é por ela que o hook do token lê o papel.
DROP POLICY "memberships_isolation" ON "memberships";
CREATE POLICY "memberships_own_read" ON "memberships" FOR SELECT TO authenticated
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid
    AND "user_id" = (auth.jwt() ->> 'sub')::uuid);

DROP POLICY "loans_isolation" ON "loans";
CREATE POLICY "loans_own_read" ON "loans" FOR SELECT TO authenticated
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid
    AND "user_id" = (auth.jwt() ->> 'sub')::uuid);

-- Leitura só do próprio ator: `loan.create` revelaria quem pegou o quê.
DROP POLICY "audit_log_isolation" ON "audit_log";
CREATE POLICY "audit_log_own_read" ON "audit_log" FOR SELECT TO authenticated
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid
    AND "actor_id" = (auth.jwt() ->> 'sub')::uuid);
