/*
  Warnings:

  - You are about to drop the `IntegrationProviderLink` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[resourceId,workspaceId]` on the table `IntegrationResourceAssignment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resourceId,groupId]` on the table `IntegrationResourceAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropTable
DROP TABLE "IntegrationProviderLink";

-- CreateIndex
CREATE INDEX "IntegrationResourceAssignment_workspaceId_idx" ON "IntegrationResourceAssignment"("workspaceId");

-- CreateIndex
CREATE INDEX "IntegrationResourceAssignment_groupId_idx" ON "IntegrationResourceAssignment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationResourceAssignment_resourceId_workspaceId_key" ON "IntegrationResourceAssignment"("resourceId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationResourceAssignment_resourceId_groupId_key" ON "IntegrationResourceAssignment"("resourceId", "groupId");
