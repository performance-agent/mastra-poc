-- CreateEnum
CREATE TYPE "GroupEvaluationEmphasis" AS ENUM ('PRODUCT', 'DELIVERY', 'ENGINEERING', 'PEOPLE', 'GITHUB_EVIDENCE', 'TICKET_EVIDENCE');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "evaluationEmphasis" "GroupEvaluationEmphasis"[] NOT NULL DEFAULT ARRAY[]::"GroupEvaluationEmphasis"[],
ADD COLUMN "evaluationNotes" TEXT;
