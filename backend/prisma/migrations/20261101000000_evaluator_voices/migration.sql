CREATE TABLE "EvaluatorVoice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluatorVoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluatorVoice_workspaceId_position_key" ON "EvaluatorVoice"("workspaceId", "position");
CREATE INDEX "EvaluatorVoice_workspaceId_idx" ON "EvaluatorVoice"("workspaceId");

ALTER TABLE "EvaluatorVoice" ADD CONSTRAINT "EvaluatorVoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EvaluatorVoice" ("id", "workspaceId", "name", "instruction", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, w."id", v.name, v.instruction, v.position, NOW(), NOW()
FROM "Workspace" w
CROSS JOIN (VALUES
    ('Demanding', 'Nombrá primero lo que está confirmado. Si hay un problema vigente, decilo sin suavizarlo. Si falta información, indicá la incertidumbre. Si no hay evidencia de algo que haya que frenar, decilo explícitamente.', 0),
    ('Direct', 'Decí lo que pasó, de forma directa, sin suavizar ni empujar.', 1),
    ('Careful', 'Nombrá lo que funciona y dejá un solo próximo paso concreto. El tono es cuidadoso.', 2)
) AS v(name, instruction, position);

ALTER TABLE "Evaluator" ADD COLUMN "personalityId" TEXT;

UPDATE "Evaluator" AS e
SET "personalityId" = v."id"
FROM "EvaluatorVoice" AS v
WHERE v."workspaceId" = e."workspaceId"
  AND (
    (e."personality"::text = 'demanding' AND v."position" = 0)
    OR (e."personality"::text = 'direct' AND v."position" = 1)
    OR (e."personality"::text = 'careful' AND v."position" = 2)
  );

ALTER TABLE "Evaluator" ALTER COLUMN "personalityId" SET NOT NULL;

CREATE INDEX "Evaluator_personalityId_idx" ON "Evaluator"("personalityId");

ALTER TABLE "Evaluator" ADD CONSTRAINT "Evaluator_personalityId_fkey" FOREIGN KEY ("personalityId") REFERENCES "EvaluatorVoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Evaluator" DROP COLUMN "personality";

DROP TYPE "EvaluatorPersonality";
