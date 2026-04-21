-- AlterEnum
ALTER TYPE "SocialAccountStatus" ADD VALUE 'REAUTH_REQUIRED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "cron_failure_notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "errorSample" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "cron_failure_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_failure_notifications_organizationId_idx" ON "cron_failure_notifications"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "cron_failure_notifications_organizationId_signature_key" ON "cron_failure_notifications"("organizationId", "signature");

-- AddForeignKey
ALTER TABLE "cron_failure_notifications" ADD CONSTRAINT "cron_failure_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
