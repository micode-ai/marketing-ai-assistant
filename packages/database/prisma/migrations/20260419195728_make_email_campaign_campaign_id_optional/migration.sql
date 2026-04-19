-- DropForeignKey
ALTER TABLE "email_campaigns" DROP CONSTRAINT "email_campaigns_campaignId_fkey";

-- AlterTable
ALTER TABLE "email_campaigns" ALTER COLUMN "campaignId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
