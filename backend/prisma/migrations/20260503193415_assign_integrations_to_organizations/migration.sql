/*
  Warnings:

  - You are about to drop the column `groupId` on the `Integration` table. All the data in the column will be lost.
  - Added the required column `organizationId` to the `Integration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "IntegrationStatus" ADD VALUE 'PENDING';

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_groupId_fkey";

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "groupId",
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
