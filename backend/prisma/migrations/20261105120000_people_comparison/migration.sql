CREATE TABLE "PeopleComparison" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL,
  "fingerprint" TEXT,
  "snapshot" JSONB,
  "result" JSONB,
  "generatedAt" TIMESTAMPTZ(3),
  "jobId" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMPTZ(3),
  "attemptedFingerprint" TEXT,
  "retryAfter" TIMESTAMPTZ(3),
  CONSTRAINT "PeopleComparison_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PeopleComparison_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PeopleComparison_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Evaluator"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PeopleComparison_evaluatorId_key" ON "PeopleComparison"("evaluatorId");
CREATE INDEX "PeopleComparison_workspaceId_idx" ON "PeopleComparison"("workspaceId");
