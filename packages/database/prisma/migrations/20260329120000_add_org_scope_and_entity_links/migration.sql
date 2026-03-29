-- CreateEnum
CREATE TYPE "EntityScope" AS ENUM ('PROJECT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "EntityLinkType" AS ENUM ('COPY', 'LINK');

-- CreateEnum
CREATE TYPE "EntityModelType" AS ENUM ('CONTENT', 'CHECKLIST', 'DOCUMENT', 'CAMPAIGN', 'EMAIL_LIST', 'KEYWORD', 'COMPETITOR', 'ANALYTICS_EVENT', 'AB_TEST', 'EMAIL_SEQUENCE');

-- DropForeignKey
ALTER TABLE "ab_tests" DROP CONSTRAINT "ab_tests_projectId_fkey";

-- DropForeignKey
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_projectId_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_projectId_fkey";

-- DropForeignKey
ALTER TABLE "checklists" DROP CONSTRAINT "checklists_projectId_fkey";

-- DropForeignKey
ALTER TABLE "competitors" DROP CONSTRAINT "competitors_projectId_fkey";

-- DropForeignKey
ALTER TABLE "content" DROP CONSTRAINT "content_projectId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "email_lists" DROP CONSTRAINT "email_lists_projectId_fkey";

-- DropForeignKey
ALTER TABLE "email_sequences" DROP CONSTRAINT "email_sequences_projectId_fkey";

-- DropForeignKey
ALTER TABLE "keywords" DROP CONSTRAINT "keywords_projectId_fkey";

-- AlterTable
ALTER TABLE "ab_tests" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "checklists" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "competitors" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "content" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "email_lists" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "email_sequences" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "scope" "EntityScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "entity_links" (
    "id" TEXT NOT NULL,
    "entityType" "EntityModelType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "linkType" "EntityLinkType" NOT NULL,
    "sourceScope" "EntityScope" NOT NULL,
    "targetScope" "EntityScope" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_links_entityType_sourceId_targetId_idx" ON "entity_links"("entityType", "sourceId", "targetId");

-- CreateIndex
CREATE INDEX "entity_links_entityType_targetId_idx" ON "entity_links"("entityType", "targetId");

-- CreateIndex
CREATE INDEX "ab_tests_scope_organizationId_idx" ON "ab_tests"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "ab_tests_scope_projectId_idx" ON "ab_tests"("scope", "projectId");

-- CreateIndex
CREATE INDEX "ab_tests_organizationId_idx" ON "ab_tests"("organizationId");

-- CreateIndex
CREATE INDEX "analytics_events_scope_organizationId_idx" ON "analytics_events"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "analytics_events_scope_projectId_idx" ON "analytics_events"("scope", "projectId");

-- CreateIndex
CREATE INDEX "analytics_events_organizationId_idx" ON "analytics_events"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_scope_organizationId_idx" ON "campaigns"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "campaigns_scope_projectId_idx" ON "campaigns"("scope", "projectId");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_idx" ON "campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "checklists_scope_organizationId_idx" ON "checklists"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "checklists_scope_projectId_idx" ON "checklists"("scope", "projectId");

-- CreateIndex
CREATE INDEX "checklists_organizationId_idx" ON "checklists"("organizationId");

-- CreateIndex
CREATE INDEX "competitors_scope_organizationId_idx" ON "competitors"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "competitors_scope_projectId_idx" ON "competitors"("scope", "projectId");

-- CreateIndex
CREATE INDEX "competitors_organizationId_idx" ON "competitors"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_organizationId_websiteUrl_key" ON "competitors"("organizationId", "websiteUrl");

-- CreateIndex
CREATE INDEX "content_scope_organizationId_idx" ON "content"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "content_scope_projectId_idx" ON "content"("scope", "projectId");

-- CreateIndex
CREATE INDEX "content_organizationId_idx" ON "content"("organizationId");

-- CreateIndex
CREATE INDEX "documents_scope_organizationId_idx" ON "documents"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "documents_scope_projectId_idx" ON "documents"("scope", "projectId");

-- CreateIndex
CREATE INDEX "documents_organizationId_idx" ON "documents"("organizationId");

-- CreateIndex
CREATE INDEX "email_lists_scope_organizationId_idx" ON "email_lists"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "email_lists_scope_projectId_idx" ON "email_lists"("scope", "projectId");

-- CreateIndex
CREATE INDEX "email_lists_organizationId_idx" ON "email_lists"("organizationId");

-- CreateIndex
CREATE INDEX "email_sequences_scope_organizationId_idx" ON "email_sequences"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "email_sequences_scope_projectId_idx" ON "email_sequences"("scope", "projectId");

-- CreateIndex
CREATE INDEX "email_sequences_organizationId_idx" ON "email_sequences"("organizationId");

-- CreateIndex
CREATE INDEX "keywords_scope_organizationId_idx" ON "keywords"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "keywords_scope_projectId_idx" ON "keywords"("scope", "projectId");

-- CreateIndex
CREATE INDEX "keywords_organizationId_idx" ON "keywords"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_organizationId_keyword_key" ON "keywords"("organizationId", "keyword");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
