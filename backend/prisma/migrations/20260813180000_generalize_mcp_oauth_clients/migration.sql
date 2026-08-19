-- AlterTable
ALTER TABLE "McpOAuthAuthorization" ADD COLUMN "clientName" TEXT NOT NULL DEFAULT 'MCP Client';

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" JSONB NOT NULL,
    "grantTypes" JSONB NOT NULL,
    "responseTypes" JSONB NOT NULL,
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "applicationType" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);
