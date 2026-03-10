-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "note" TEXT,
ADD COLUMN     "noteUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "noteUpdatedBy" TEXT,
ADD COLUMN     "section" TEXT;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_noteUpdatedBy_fkey" FOREIGN KEY ("noteUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
