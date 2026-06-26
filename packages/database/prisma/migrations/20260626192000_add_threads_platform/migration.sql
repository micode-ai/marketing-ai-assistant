-- AlterEnum
BEGIN;
CREATE TYPE "SocialPlatform_new" AS ENUM ('TWITTER', 'LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'TELEGRAM', 'GOOGLE_PLAY', 'GOOGLE_CSE', 'THREADS');
ALTER TABLE "project_api_keys" ALTER COLUMN "platform" TYPE "SocialPlatform_new" USING ("platform"::text::"SocialPlatform_new");
ALTER TABLE "content" ALTER COLUMN "platform" TYPE "SocialPlatform_new" USING ("platform"::text::"SocialPlatform_new");
ALTER TABLE "social_accounts" ALTER COLUMN "platform" TYPE "SocialPlatform_new" USING ("platform"::text::"SocialPlatform_new");
ALTER TABLE "content_publications" ALTER COLUMN "platform" TYPE "SocialPlatform_new" USING ("platform"::text::"SocialPlatform_new");
ALTER TYPE "SocialPlatform" RENAME TO "SocialPlatform_old";
ALTER TYPE "SocialPlatform_new" RENAME TO "SocialPlatform";
DROP TYPE "public"."SocialPlatform_old";
COMMIT;
