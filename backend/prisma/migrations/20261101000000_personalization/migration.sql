ALTER TABLE "Organization" ADD COLUMN "appearance" JSONB;
CREATE TABLE "ExperienceSetting" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "scope" TEXT NOT NULL DEFAULT 'global', "preferences" JSONB NOT NULL, "setup" JSONB,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ExperienceSetting_userId_scope_key" UNIQUE ("userId", "scope")
);
CREATE TABLE "MediaAsset" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
 "scope" TEXT NOT NULL, "targetId" TEXT NOT NULL, "purpose" TEXT NOT NULL,
 "objectPath" TEXT NOT NULL UNIQUE, "bytes" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MediaAsset_scope_targetId_idx" ON "MediaAsset"("scope", "targetId");
