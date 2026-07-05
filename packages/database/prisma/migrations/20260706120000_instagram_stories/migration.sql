-- CreateTable
CREATE TABLE "instagram_stories" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "igStoryId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "reach" INTEGER,
    "views" INTEGER,
    "replies" INTEGER,
    "shares" INTEGER,
    "totalInteractions" INTEGER,
    "tapsForward" INTEGER,
    "tapsBack" INTEGER,
    "exits" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instagram_stories_socialAccountId_idx" ON "instagram_stories"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_stories_socialAccountId_igStoryId_key" ON "instagram_stories"("socialAccountId", "igStoryId");

-- AddForeignKey
ALTER TABLE "instagram_stories" ADD CONSTRAINT "instagram_stories_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
