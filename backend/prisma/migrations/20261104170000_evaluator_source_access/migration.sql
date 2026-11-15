ALTER TABLE "Evaluator" ADD COLUMN "disabledKnowledgeNodeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "disabledResourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
