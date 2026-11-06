-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "image_path" TEXT,
ADD COLUMN     "photo_author" TEXT,
ADD COLUMN     "photo_license" TEXT,
ADD COLUMN     "photo_source" TEXT,
ALTER COLUMN "asset_tag" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "equipment_tenant_id_asset_tag_key" ON "equipment"("tenant_id", "asset_tag");


-- SQL bruto: objetos não cobertos pelo Prisma (ADR-001 §5).

-- CHECK constraints (sem suporte nativo no Prisma schema)
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_category_check" CHECK ("category" IN ('notebook', 'monitor', 'cabo', 'camera'));
