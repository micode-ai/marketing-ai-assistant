-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('WEBSITE', 'MOBILE_APP', 'SAAS', 'ECOMMERCE', 'BLOG', 'OTHER');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "projectType" "ProjectType" NOT NULL DEFAULT 'WEBSITE';
