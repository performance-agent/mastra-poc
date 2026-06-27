/*
  Warnings:

  - You are about to drop the `GithubIntegration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GithubRepository` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Integration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IntegrationResource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IntegrationResourceAssignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PluginInstallationStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "GithubIntegration" DROP CONSTRAINT "GithubIntegration_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "GithubRepository" DROP CONSTRAINT "GithubRepository_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationResource" DROP CONSTRAINT "IntegrationResource_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationResourceAssignment" DROP CONSTRAINT "IntegrationResourceAssignment_groupId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationResourceAssignment" DROP CONSTRAINT "IntegrationResourceAssignment_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationResourceAssignment" DROP CONSTRAINT "IntegrationResourceAssignment_workspaceId_fkey";

-- DropTable
DROP TABLE "GithubIntegration";

-- DropTable
DROP TABLE "GithubRepository";

-- DropTable
DROP TABLE "Integration";

-- DropTable
DROP TABLE "IntegrationResource";

-- DropTable
DROP TABLE "IntegrationResourceAssignment";

-- DropEnum
DROP TYPE "IntegrationProvider";

-- DropEnum
DROP TYPE "IntegrationResourceType";

-- DropEnum
DROP TYPE "IntegrationStatus";

-- CreateTable
CREATE TABLE "PluginInstallationResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PluginInstallationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginInstallationResourceAssignment" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginInstallationResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginInstallation" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "pluginVersion" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "status" "PluginInstallationStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMPTZ(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PluginInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PluginInstallationResource_installationId_idx" ON "PluginInstallationResource"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallationResource_installationId_externalId_key" ON "PluginInstallationResource"("installationId", "externalId");

-- CreateIndex
CREATE INDEX "PluginInstallationResourceAssignment_workspaceId_idx" ON "PluginInstallationResourceAssignment"("workspaceId");

-- CreateIndex
CREATE INDEX "PluginInstallationResourceAssignment_groupId_idx" ON "PluginInstallationResourceAssignment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallationResourceAssignment_resourceId_workspaceId_key" ON "PluginInstallationResourceAssignment"("resourceId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallationResourceAssignment_resourceId_groupId_key" ON "PluginInstallationResourceAssignment"("resourceId", "groupId");

-- CreateIndex
CREATE INDEX "PluginInstallation_status_idx" ON "PluginInstallation"("status");

CREATE INDEX "PluginInstallation_organizationId_idx" ON "PluginInstallation"("organizationId");

CREATE UNIQUE INDEX "PluginInstallation_pluginId_externalId_key" ON "PluginInstallation"("pluginId", "externalId");

-- AddForeignKey
ALTER TABLE "PluginInstallationResource" ADD CONSTRAINT "PluginInstallationResource_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginInstallationResourceAssignment" ADD CONSTRAINT "PluginInstallationResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PluginInstallationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginInstallationResourceAssignment" ADD CONSTRAINT "PluginInstallationResourceAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginInstallationResourceAssignment" ADD CONSTRAINT "PluginInstallationResourceAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginInstallation" ADD CONSTRAINT "PluginInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
