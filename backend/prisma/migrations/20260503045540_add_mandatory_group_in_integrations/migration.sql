/*
  Warnings:

  - Made the column `groupId` on table `Integration` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_groupId_fkey";

-- AlterTable
ALTER TABLE "Integration" ALTER COLUMN "groupId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
