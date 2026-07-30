-- CreateTable
CREATE TABLE "tiktok_account_metrics" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followersCount" INTEGER,
    "followingCount" INTEGER,
    "likesCount" INTEGER,
    "videoCount" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_account_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_media" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "tiktokVideoId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "shareUrl" TEXT,
    "embedLink" TEXT,
    "duration" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tiktok_account_metrics_socialAccountId_idx" ON "tiktok_account_metrics"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_account_metrics_socialAccountId_date_key" ON "tiktok_account_metrics"("socialAccountId", "date");

-- CreateIndex
CREATE INDEX "tiktok_media_socialAccountId_idx" ON "tiktok_media"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_media_socialAccountId_tiktokVideoId_key" ON "tiktok_media"("socialAccountId", "tiktokVideoId");

-- AddForeignKey
ALTER TABLE "tiktok_account_metrics" ADD CONSTRAINT "tiktok_account_metrics_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_media" ADD CONSTRAINT "tiktok_media_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
