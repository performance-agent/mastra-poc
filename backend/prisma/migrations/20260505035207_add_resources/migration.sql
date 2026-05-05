/*
  Warnings:

  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IntegrationResourceType" AS ENUM ('REPOSITORY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- CreateTable
CREATE TABLE "GithubRepository" (
    "resourceId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT,
    "htmlUrl" TEXT,
    "isPrivate" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("resourceId")
);

-- CreateTable
CREATE TABLE "IntegrationResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "externalId" TEXT NOT NULL,
    "type" "IntegrationResourceType" NOT NULL,
    "integrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationResourceAssignment" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationProviderLink" (
    "id" TEXT NOT NULL,
    "installUrl" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationProviderLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationResource_integrationId_idx" ON "IntegrationResource"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationResource_integrationId_externalId_key" ON "IntegrationResource"("integrationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProviderLink_provider_key" ON "IntegrationProviderLink"("provider");

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "IntegrationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationResource" ADD CONSTRAINT "IntegrationResource_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationResourceAssignment" ADD CONSTRAINT "IntegrationResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "IntegrationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationResourceAssignment" ADD CONSTRAINT "IntegrationResourceAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationResourceAssignment" ADD CONSTRAINT "IntegrationResourceAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
