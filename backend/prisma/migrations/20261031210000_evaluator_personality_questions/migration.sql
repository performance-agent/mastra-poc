-- CreateEnum
CREATE TYPE "EvaluatorPersonality" AS ENUM ('demanding', 'direct', 'careful');

-- AlterTable
ALTER TABLE "Evaluator" ADD COLUMN "personality" "EvaluatorPersonality" NOT NULL DEFAULT 'direct';

UPDATE "Evaluator" SET "personality" = 'demanding' WHERE "name" = 'Strict';
UPDATE "Evaluator" SET "personality" = 'careful' WHERE "name" = 'Gentle';

-- CreateTable
CREATE TABLE "EvaluatorQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EvaluatorQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EvaluatorQuestion_position_check" CHECK ("position" >= 0)
);

-- CreateIndex
CREATE INDEX "EvaluatorQuestion_evaluatorId_idx" ON "EvaluatorQuestion"("evaluatorId");
CREATE UNIQUE INDEX "EvaluatorQuestion_evaluatorId_position_key" ON "EvaluatorQuestion"("evaluatorId", "position");

-- AddForeignKey
ALTER TABLE "EvaluatorQuestion" ADD CONSTRAINT "EvaluatorQuestion_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Evaluator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
