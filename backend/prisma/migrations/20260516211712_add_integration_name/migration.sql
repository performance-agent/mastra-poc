/*
  Warnings:

  - Added the required column `name` to the `Integration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "name" TEXT;

UPDATE "Integration" SET "name" = 'Integration' WHERE "name" IS NULL;

ALTER TABLE "Integration" ALTER COLUMN "name" SET NOT NULL;
