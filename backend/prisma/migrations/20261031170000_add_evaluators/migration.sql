-- CreateEnum
CREATE TYPE "EvaluatorScope" AS ENUM ('WORKSPACE', 'GROUP');

-- CreateEnum
CREATE TYPE "EvaluatorEffort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Evaluator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "EvaluatorScope" NOT NULL,
    "effort" "EvaluatorEffort" NOT NULL DEFAULT 'MEDIUM',
    "avatar" INTEGER NOT NULL DEFAULT 0,
    "evaluationEmphasis" "GroupEvaluationEmphasis"[] NOT NULL DEFAULT ARRAY[]::"GroupEvaluationEmphasis"[],
    "evaluationNotes" TEXT,
    "workspaceId" TEXT NOT NULL,
    "groupId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Evaluator_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Evaluator_scope_group_check" CHECK (
      ("scope" = 'WORKSPACE' AND "groupId" IS NULL) OR
      ("scope" = 'GROUP' AND "groupId" IS NOT NULL)
    ),
    CONSTRAINT "Evaluator_avatar_check" CHECK ("avatar" BETWEEN 0 AND 7)
);

-- CreateTable
CREATE TABLE "EvaluatorRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuation" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EvaluatorRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvaluatorRule_valuation_check" CHECK ("valuation" BETWEEN 1 AND 10),
    CONSTRAINT "EvaluatorRule_position_check" CHECK ("position" >= 0)
);

-- CreateIndex
CREATE INDEX "Evaluator_scope_idx" ON "Evaluator"("scope");
CREATE INDEX "Evaluator_workspaceId_idx" ON "Evaluator"("workspaceId");
CREATE INDEX "Evaluator_groupId_idx" ON "Evaluator"("groupId");
CREATE INDEX "Evaluator_ownerId_idx" ON "Evaluator"("ownerId");
CREATE INDEX "EvaluatorRule_evaluatorId_idx" ON "EvaluatorRule"("evaluatorId");
CREATE UNIQUE INDEX "EvaluatorRule_evaluatorId_position_key" ON "EvaluatorRule"("evaluatorId", "position");

-- AddForeignKey
ALTER TABLE "Evaluator" ADD CONSTRAINT "Evaluator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluator" ADD CONSTRAINT "Evaluator_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluator" ADD CONSTRAINT "Evaluator_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvaluatorRule" ADD CONSTRAINT "EvaluatorRule_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Evaluator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PerformanceReport" ADD COLUMN "evaluatorId" TEXT;
CREATE INDEX "PerformanceReport_evaluatorId_idx" ON "PerformanceReport"("evaluatorId");
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Evaluator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy existing group guidelines into a project evaluator.
INSERT INTO "Evaluator" (
    "id", "name", "scope", "effort", "avatar", "evaluationEmphasis", "evaluationNotes",
    "workspaceId", "groupId", "updatedAt"
)
SELECT
    'general_' || "id",
    'General',
    'GROUP'::"EvaluatorScope",
    'MEDIUM'::"EvaluatorEffort",
    1,
    "evaluationEmphasis",
    "evaluationNotes",
    "workspaceId",
    "id",
    CURRENT_TIMESTAMP
FROM "Group"
WHERE cardinality("evaluationEmphasis") > 0
   OR ("evaluationNotes" IS NOT NULL AND btrim("evaluationNotes") <> '');

-- Default workspace evaluators.
INSERT INTO "Evaluator" (
    "id", "name", "description", "scope", "effort", "avatar", "evaluationEmphasis",
    "workspaceId", "updatedAt"
)
SELECT 'strict_' || "id", 'Strict', 'Looks closely at engineering discipline and calls out gaps.', 'WORKSPACE'::"EvaluatorScope", 'HIGH'::"EvaluatorEffort", 0, ARRAY['ENGINEERING']::"GroupEvaluationEmphasis"[], "id", CURRENT_TIMESTAMP FROM "Workspace"
UNION ALL
SELECT 'gentle_' || "id", 'Gentle', 'Pays attention to people and keeps the tone supportive.', 'WORKSPACE'::"EvaluatorScope", 'LOW'::"EvaluatorEffort", 5, ARRAY['PEOPLE']::"GroupEvaluationEmphasis"[], "id", CURRENT_TIMESTAMP FROM "Workspace"
UNION ALL
SELECT 'technical_' || "id", 'Technical', 'Focuses on how the code and the reviews actually look.', 'WORKSPACE'::"EvaluatorScope", 'MEDIUM'::"EvaluatorEffort", 4, ARRAY['ENGINEERING']::"GroupEvaluationEmphasis"[], "id", CURRENT_TIMESTAMP FROM "Workspace";

INSERT INTO "EvaluatorRule" ("id", "name", "description", "valuation", "position", "evaluatorId", "updatedAt")
SELECT 'strict_rule_' || "id", 'Reviewed changes', 'Los cambios importantes tienen que mostrar revisión y un propósito claro.', 9, 0, 'strict_' || "id", CURRENT_TIMESTAMP FROM "Workspace"
UNION ALL
SELECT 'gentle_rule_' || "id", 'Room to improve', 'Señalá lo que funciona antes de marcar un hueco, y dejá el próximo paso concreto.', 6, 0, 'gentle_' || "id", CURRENT_TIMESTAMP FROM "Workspace"
UNION ALL
SELECT 'technical_rule_' || "id", 'Traceable engineering', 'Preferí evidencia de cambios, revisiones y mantenimiento antes que el volumen de actividad.', 8, 0, 'technical_' || "id", CURRENT_TIMESTAMP FROM "Workspace";
