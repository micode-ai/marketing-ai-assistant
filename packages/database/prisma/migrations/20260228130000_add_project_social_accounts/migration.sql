-- CreateTable
CREATE TABLE "project_social_accounts" (
    "projectId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,

    CONSTRAINT "project_social_accounts_pkey" PRIMARY KEY ("projectId","socialAccountId")
);

-- AddForeignKey
ALTER TABLE "project_social_accounts" ADD CONSTRAINT "project_social_accounts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_social_accounts" ADD CONSTRAINT "project_social_accounts_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
