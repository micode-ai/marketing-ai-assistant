-- AlterTable
ALTER TABLE "content" ADD COLUMN "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[];
