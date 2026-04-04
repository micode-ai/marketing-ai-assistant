-- AlterTable: make projectId optional, add organizationId and scope
ALTER TABLE "finance_categories" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "finance_categories" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "finance_categories" ADD COLUMN "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT';

ALTER TABLE "finance_records" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "finance_records" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "finance_records" ADD COLUMN "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT';

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_organizationId_name_key" ON "finance_categories"("organizationId", "name");
CREATE INDEX "finance_categories_organizationId_idx" ON "finance_categories"("organizationId");
CREATE INDEX "finance_categories_scope_organizationId_idx" ON "finance_categories"("scope", "organizationId");

CREATE INDEX "finance_records_organizationId_idx" ON "finance_records"("organizationId");
CREATE INDEX "finance_records_scope_organizationId_idx" ON "finance_records"("scope", "organizationId");
