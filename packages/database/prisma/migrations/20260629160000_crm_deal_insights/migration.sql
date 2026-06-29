-- CreateTable
CREATE TABLE "deal_insights" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "scoreReason" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "draftSubject" TEXT,
    "draftBody" TEXT NOT NULL,
    "language" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deal_insights_dealId_key" ON "deal_insights"("dealId");

-- AddForeignKey
ALTER TABLE "deal_insights" ADD CONSTRAINT "deal_insights_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
