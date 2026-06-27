-- CreateTable
CREATE TABLE "instagram_account_metrics" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followersCount" INTEGER,
    "reach" INTEGER,
    "views" INTEGER,
    "accountsEngaged" INTEGER,
    "totalInteractions" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_account_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_media" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "igMediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "likeCount" INTEGER,
    "commentsCount" INTEGER,
    "reach" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "views" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instagram_account_metrics_socialAccountId_idx" ON "instagram_account_metrics"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_account_metrics_socialAccountId_date_key" ON "instagram_account_metrics"("socialAccountId", "date");

-- CreateIndex
CREATE INDEX "instagram_media_socialAccountId_idx" ON "instagram_media"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_socialAccountId_igMediaId_key" ON "instagram_media"("socialAccountId", "igMediaId");

-- AddForeignKey
ALTER TABLE "instagram_account_metrics" ADD CONSTRAINT "instagram_account_metrics_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_media" ADD CONSTRAINT "instagram_media_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
