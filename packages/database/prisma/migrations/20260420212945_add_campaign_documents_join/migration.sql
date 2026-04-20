-- CreateTable
CREATE TABLE "campaign_documents" (
    "campaignId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_documents_pkey" PRIMARY KEY ("campaignId","documentId")
);

-- CreateIndex
CREATE INDEX "campaign_documents_documentId_idx" ON "campaign_documents"("documentId");

-- AddForeignKey
ALTER TABLE "campaign_documents" ADD CONSTRAINT "campaign_documents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_documents" ADD CONSTRAINT "campaign_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
