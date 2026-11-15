ALTER TABLE "Group" ADD COLUMN "evaluationSequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PerformanceReport" ADD COLUMN "evaluationVersion" INTEGER;
CREATE UNIQUE INDEX "PerformanceReport_groupId_evaluationVersion_key" ON "PerformanceReport"("groupId", "evaluationVersion");
CREATE TABLE "EvaluationEvidenceCache" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "operationName" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EvaluationEvidenceCache_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EvaluationEvidenceCache_expiresAt_idx" ON "EvaluationEvidenceCache"("expiresAt");
ALTER TABLE "EvaluationEvidenceCache" ADD CONSTRAINT "EvaluationEvidenceCache_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
