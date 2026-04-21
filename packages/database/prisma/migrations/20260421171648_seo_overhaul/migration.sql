-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'DISMISSED');

-- AlterEnum
ALTER TYPE "SocialPlatform" ADD VALUE 'GOOGLE_CSE';

-- AlterTable
ALTER TABLE "competitors" ADD COLUMN     "aiRationale" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CompetitorStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suggestedAt" TIMESTAMP(3);

-- Backfill: mark existing competitors as approved at creation time
UPDATE "competitors" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "lastCheckError" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-US';

-- AlterTable
ALTER TABLE "project_api_keys" ADD COLUMN     "lastValidationError" TEXT;
