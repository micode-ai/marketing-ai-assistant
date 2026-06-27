-- CreateTable
CREATE TABLE "threads_account_metrics" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followersCount" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "replies" INTEGER,
    "reposts" INTEGER,
    "quotes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_account_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads_media" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "threadsMediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "text" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "replies" INTEGER,
    "reposts" INTEGER,
    "quotes" INTEGER,
    "shares" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threads_account_metrics_socialAccountId_idx" ON "threads_account_metrics"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "threads_account_metrics_socialAccountId_date_key" ON "threads_account_metrics"("socialAccountId", "date");

-- CreateIndex
CREATE INDEX "threads_media_socialAccountId_idx" ON "threads_media"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "threads_media_socialAccountId_threadsMediaId_key" ON "threads_media"("socialAccountId", "threadsMediaId");

-- AddForeignKey
ALTER TABLE "threads_account_metrics" ADD CONSTRAINT "threads_account_metrics_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads_media" ADD CONSTRAINT "threads_media_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
