-- AlterEnum
ALTER TYPE "SocialPlatform" ADD VALUE 'GOOGLE_PLAY';

-- CreateTable
CREATE TABLE "app_store_metrics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "uninstalls" INTEGER NOT NULL DEFAULT 0,
    "updates" INTEGER NOT NULL DEFAULT 0,
    "activeDeviceInstalls" INTEGER NOT NULL DEFAULT 0,
    "storeListingVisitors" INTEGER NOT NULL DEFAULT 0,
    "storeListingConversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crashes" INTEGER NOT NULL DEFAULT 0,
    "anrs" INTEGER NOT NULL DEFAULT 0,
    "crashRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "anrRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "ratingsCount1" INTEGER NOT NULL DEFAULT 0,
    "ratingsCount2" INTEGER NOT NULL DEFAULT 0,
    "ratingsCount3" INTEGER NOT NULL DEFAULT 0,
    "ratingsCount4" INTEGER NOT NULL DEFAULT 0,
    "ratingsCount5" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION,
    "revenuePerUser" DOUBLE PRECISION,
    "newSubscriptions" INTEGER,
    "cancelledSubscriptions" INTEGER,
    "activeSubscriptions" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_store_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reviews" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "starRating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reviewCreatedAt" TIMESTAMP(3) NOT NULL,
    "replyText" TEXT,
    "replyCreatedAt" TIMESTAMP(3),
    "aiSuggestedReply" TEXT,
    "isReplied" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_store_metrics_projectId_date_idx" ON "app_store_metrics"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "app_store_metrics_projectId_date_key" ON "app_store_metrics"("projectId", "date");

-- CreateIndex
CREATE INDEX "app_reviews_projectId_starRating_idx" ON "app_reviews"("projectId", "starRating");

-- CreateIndex
CREATE INDEX "app_reviews_projectId_isReplied_idx" ON "app_reviews"("projectId", "isReplied");

-- CreateIndex
CREATE UNIQUE INDEX "app_reviews_projectId_reviewId_key" ON "app_reviews"("projectId", "reviewId");

-- AddForeignKey
ALTER TABLE "app_store_metrics" ADD CONSTRAINT "app_store_metrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_reviews" ADD CONSTRAINT "app_reviews_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
