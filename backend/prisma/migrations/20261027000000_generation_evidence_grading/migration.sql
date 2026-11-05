-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "gradingSettings" JSONB;

-- CreateTable
CREATE TABLE "ProviderRecord" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "syncedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceSync" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "checkpoint" TIMESTAMPTZ(3),
    "head" TEXT,
    "progress" JSONB,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "nextRetryAt" TIMESTAMPTZ(3),
    "error" TEXT,

    CONSTRAINT "ResourceSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCoverage" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "from" TIMESTAMPTZ(3) NOT NULL,
    "to" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "groupId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "groupId" TEXT,
    "source" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderRecord_resourceId_operation_idx" ON "ProviderRecord"("resourceId", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRecord_installationId_resourceId_operation_external_key" ON "ProviderRecord"("installationId", "resourceId", "operation", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceSync_installationId_resourceId_operation_key" ON "ResourceSync"("installationId", "resourceId", "operation");

-- CreateIndex
CREATE INDEX "SyncCoverage_resourceId_operation_idx" ON "SyncCoverage"("resourceId", "operation");

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_workspaceId_groupId_idx" ON "GenerationJob"("workspaceId", "groupId");

-- CreateIndex
CREATE INDEX "TaskAnalysis_workspaceId_groupId_idx" ON "TaskAnalysis"("workspaceId", "groupId");

-- AddForeignKey
ALTER TABLE "ProviderRecord" ADD CONSTRAINT "ProviderRecord_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PluginInstallationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSync" ADD CONSTRAINT "ResourceSync_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PluginInstallationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCoverage" ADD CONSTRAINT "SyncCoverage_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PluginInstallationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAnalysis" ADD CONSTRAINT "TaskAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

