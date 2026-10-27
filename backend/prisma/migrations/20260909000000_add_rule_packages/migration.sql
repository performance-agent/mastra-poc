-- CreateEnum
CREATE TYPE "RulePackageScope" AS ENUM ('PUBLIC', 'WORKSPACE', 'ALL_WORKSPACES');

-- CreateTable
CREATE TABLE "RulePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "evaluates" TEXT NOT NULL,
    "scope" "RulePackageScope" NOT NULL,
    "ownerId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RulePackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RulePackage_scope_owner_workspace_check" CHECK (
      ("scope" = 'PUBLIC' AND "ownerId" IS NULL AND "workspaceId" IS NULL) OR
      ("scope" = 'WORKSPACE' AND "ownerId" IS NOT NULL AND "workspaceId" IS NOT NULL) OR
      ("scope" = 'ALL_WORKSPACES' AND "ownerId" IS NOT NULL AND "workspaceId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "RulePackageRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuation" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "packageId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RulePackageRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RulePackageRule_valuation_check" CHECK ("valuation" BETWEEN 1 AND 10),
    CONSTRAINT "RulePackageRule_position_check" CHECK ("position" >= 0)
);

-- CreateIndex
CREATE INDEX "RulePackage_scope_idx" ON "RulePackage"("scope");
CREATE INDEX "RulePackage_ownerId_idx" ON "RulePackage"("ownerId");
CREATE INDEX "RulePackage_workspaceId_idx" ON "RulePackage"("workspaceId");
CREATE INDEX "RulePackageRule_packageId_idx" ON "RulePackageRule"("packageId");
CREATE UNIQUE INDEX "RulePackageRule_packageId_position_key" ON "RulePackageRule"("packageId", "position");

-- AddForeignKey
ALTER TABLE "RulePackage" ADD CONSTRAINT "RulePackage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RulePackage" ADD CONSTRAINT "RulePackage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RulePackageRule" ADD CONSTRAINT "RulePackageRule_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "RulePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed public starter packages with stable, deterministic IDs.
INSERT INTO "RulePackage" ("id", "name", "evaluates", "scope", "updatedAt") VALUES
  ('builtin-sustainable-delivery', 'Sustainable & Collaborative Delivery', 'Workload distribution, review participation, delivery continuity, cycle time, and rework.', 'PUBLIC', CURRENT_TIMESTAMP),
  ('builtin-engineering-quality', 'Engineering Quality & Review', 'Change traceability, meaningful peer review, maintainability, and repeated corrective work.', 'PUBLIC', CURRENT_TIMESTAMP),
  ('builtin-product-execution', 'Product Execution & Ticket Flow', 'Priority clarity, ticket progression, scope continuity, and links between planned and delivered work.', 'PUBLIC', CURRENT_TIMESTAMP);

INSERT INTO "RulePackageRule" ("id", "packageId", "position", "name", "description", "valuation", "updatedAt") VALUES
  ('builtin-sustainable-delivery-1', 'builtin-sustainable-delivery', 0, 'Balanced contribution', 'Delivery should be reasonably distributed and should not depend on a single contributor or a short burst of activity.', 8, CURRENT_TIMESTAMP),
  ('builtin-sustainable-delivery-2', 'builtin-sustainable-delivery', 1, 'Sustainable delivery flow', 'Most work should avoid prolonged delays, repeated rework, and reverted changes while accounting for complexity.', 8, CURRENT_TIMESTAMP),
  ('builtin-sustainable-delivery-3', 'builtin-sustainable-delivery', 2, 'Collaborative review and traceability', 'Complex work should receive meaningful peer review and remain traceable through the team''s available evidence.', 8, CURRENT_TIMESTAMP),
  ('builtin-engineering-quality-1', 'builtin-engineering-quality', 0, 'Traceable engineering changes', 'Material engineering changes should have enough repository or ticket context to explain their purpose and outcome.', 8, CURRENT_TIMESTAMP),
  ('builtin-engineering-quality-2', 'builtin-engineering-quality', 1, 'Meaningful peer review', 'Substantial or risky changes should receive timely review that goes beyond approval without engagement.', 8, CURRENT_TIMESTAMP),
  ('builtin-engineering-quality-3', 'builtin-engineering-quality', 2, 'Maintainable delivery', 'Activity should avoid recurring corrective work, repeated reversions, and maintenance patterns that indicate preventable quality problems.', 7, CURRENT_TIMESTAMP),
  ('builtin-product-execution-1', 'builtin-product-execution', 0, 'Clear priorities and scope', 'Planned work should communicate its intended outcome and retain enough scope clarity for progress to be assessed.', 8, CURRENT_TIMESTAMP),
  ('builtin-product-execution-2', 'builtin-product-execution', 1, 'Continuous ticket flow', 'Work items should progress consistently without unexplained stagnation, excessive churn, or repeated reopening.', 7, CURRENT_TIMESTAMP),
  ('builtin-product-execution-3', 'builtin-product-execution', 2, 'Plan-to-delivery linkage', 'Delivered changes should be traceable to planned work so completed activity can be connected to product intent.', 8, CURRENT_TIMESTAMP);
