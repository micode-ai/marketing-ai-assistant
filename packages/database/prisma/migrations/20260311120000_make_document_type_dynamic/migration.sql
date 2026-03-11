-- Create document_type_configs table
CREATE TABLE "document_type_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_type_configs_organizationId_slug_key" ON "document_type_configs"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "document_type_configs_organizationId_idx" ON "document_type_configs"("organizationId");

-- AddForeignKey
ALTER TABLE "document_type_configs" ADD CONSTRAINT "document_type_configs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default types for all existing organizations
INSERT INTO "document_type_configs" ("id", "organizationId", "slug", "label", "isDefault", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, o."id", dt.slug, dt.label, true, dt.sort_order, NOW()
FROM "organizations" o
CROSS JOIN (VALUES
  ('MARKETING_PLAN', 'Marketing Plan', 0),
  ('REPORT', 'Performance Report', 1),
  ('COMPETITIVE_ANALYSIS', 'Competitive Analysis', 2),
  ('BRAND_GUIDELINES', 'Brand Guidelines', 3),
  ('CONTENT_CALENDAR', 'Content Calendar', 4),
  ('PROPOSAL', 'Proposal', 5),
  ('PRESENTATION', 'Presentation', 6),
  ('PRODUCT_HUNT_BRIEF', 'Product Hunt Brief', 7)
) AS dt(slug, label, sort_order);

-- Convert Document.type from enum to text (preserves existing values)
ALTER TABLE "documents" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- Drop old enum
DROP TYPE "DocumentType";
