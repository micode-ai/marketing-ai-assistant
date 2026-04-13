-- AlterTable
ALTER TABLE "content" ADD COLUMN     "contentGroupId" TEXT,
ADD COLUMN     "language" TEXT;

-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "language" TEXT;

-- CreateIndex
CREATE INDEX "content_contentGroupId_idx" ON "content"("contentGroupId");
