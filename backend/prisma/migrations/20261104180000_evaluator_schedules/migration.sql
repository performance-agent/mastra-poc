CREATE TABLE "EvaluatorSchedule" (
  "id" TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "days" INTEGER[] NOT NULL,
  "hour" INTEGER NOT NULL,
  "minute" INTEGER NOT NULL,
  "timeZone" TEXT NOT NULL,
  "lastRunOn" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EvaluatorSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluatorSchedule_evaluatorId_groupId_key" ON "EvaluatorSchedule"("evaluatorId", "groupId");
CREATE INDEX "EvaluatorSchedule_groupId_idx" ON "EvaluatorSchedule"("groupId");
ALTER TABLE "EvaluatorSchedule" ADD CONSTRAINT "EvaluatorSchedule_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Evaluator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluatorSchedule" ADD CONSTRAINT "EvaluatorSchedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
