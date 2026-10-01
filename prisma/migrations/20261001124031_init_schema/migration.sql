-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_tag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disponivel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "borrowed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '14 days'),
    "returned_at" TIMESTAMP(3),
    "returned_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL bruto: objetos não cobertos pelo Prisma (ADR-001 §5).

-- FKs para auth.users (schema do Supabase Auth, fora do Prisma)
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (sem suporte nativo no Prisma schema)
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ("role" IN ('colaborador', 'operacoes'));
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_status_check" CHECK ("status" IN ('disponivel', 'emprestado', 'manutencao'));

-- RLS: habilitada em todas as tabelas, deny by default (ADR-001 §7).
-- Isolamento por tenant via claim do JWT. Defesa em profundidade: o
-- Prisma conecta com role dona das tabelas e bypassa RLS por padrão
-- (ADR-001 §7); a autorização real acontece na aplicação (guards + CASL).
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_isolation" ON "tenants"
  USING ("id" = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_isolation" ON "memberships"
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_isolation" ON "equipment"
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans_isolation" ON "loans"
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_isolation" ON "audit_log"
  USING ("tenant_id" = (auth.jwt() ->> 'tenant_id')::uuid);
