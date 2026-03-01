-- AlterTable: Add trackingId to projects
ALTER TABLE "projects" ADD COLUMN "trackingId" TEXT;

-- Backfill existing rows with unique tracking IDs
UPDATE "projects" SET "trackingId" = gen_random_uuid()::text WHERE "trackingId" IS NULL;

-- CreateIndex: Unique constraint on trackingId
CREATE UNIQUE INDEX "projects_trackingId_key" ON "projects"("trackingId");

-- CreateIndex: Composite index on analytics_events for cron aggregation
CREATE INDEX "analytics_events_projectId_type_timestamp_idx" ON "analytics_events"("projectId", "type", "timestamp");
