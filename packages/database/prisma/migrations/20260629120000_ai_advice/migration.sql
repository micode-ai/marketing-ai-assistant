-- CreateTable
CREATE TABLE "ai_advice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "contextSummary" TEXT,
    "language" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_advice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_advice_projectId_channel_key" ON "ai_advice"("projectId", "channel");

-- AddForeignKey
ALTER TABLE "ai_advice" ADD CONSTRAINT "ai_advice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
