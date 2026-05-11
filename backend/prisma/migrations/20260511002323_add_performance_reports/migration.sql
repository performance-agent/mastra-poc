-- CreateEnum
CREATE TYPE "PerformanceReportType" AS ENUM ('GITHUB_ACTIVITY');

-- CreateTable
CREATE TABLE "PerformanceReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "workspaceId" TEXT,
    "groupId" TEXT,
    "type" "PerformanceReportType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PerformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceReport_organizationId_idx" ON "PerformanceReport"("organizationId");

-- CreateIndex
CREATE INDEX "PerformanceReport_workspaceId_idx" ON "PerformanceReport"("workspaceId");

-- CreateIndex
CREATE INDEX "PerformanceReport_groupId_idx" ON "PerformanceReport"("groupId");

-- CreateIndex
CREATE INDEX "PerformanceReport_type_idx" ON "PerformanceReport"("type");

-- CreateIndex
CREATE INDEX "PerformanceReport_createdAt_idx" ON "PerformanceReport"("createdAt");

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
