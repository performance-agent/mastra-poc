-- CreateEnum
CREATE TYPE "McpOAuthTokenKind" AS ENUM ('ACCESS', 'REFRESH');

-- CreateTable
CREATE TABLE "McpOAuthAuthorization" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "userId" TEXT,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "approvedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "McpOAuthTokenKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthAuthorization_codeHash_key" ON "McpOAuthAuthorization"("codeHash");
CREATE INDEX "McpOAuthAuthorization_expiresAt_idx" ON "McpOAuthAuthorization"("expiresAt");
CREATE INDEX "McpOAuthAuthorization_userId_idx" ON "McpOAuthAuthorization"("userId");
CREATE UNIQUE INDEX "McpOAuthToken_tokenHash_key" ON "McpOAuthToken"("tokenHash");
CREATE INDEX "McpOAuthToken_userId_kind_expiresAt_idx" ON "McpOAuthToken"("userId", "kind", "expiresAt");

-- AddForeignKey
ALTER TABLE "McpOAuthAuthorization" ADD CONSTRAINT "McpOAuthAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpOAuthToken" ADD CONSTRAINT "McpOAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
