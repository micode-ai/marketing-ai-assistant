-- CreateTable
CREATE TABLE "analytics_recommendations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "language" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_recommendations_projectId_key" ON "analytics_recommendations"("projectId");

-- AddForeignKey
ALTER TABLE "analytics_recommendations" ADD CONSTRAINT "analytics_recommendations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
