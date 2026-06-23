CREATE TABLE "ConnectionSetupSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConnectionSetupSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectionSetupSession_organizationId_idx" ON "ConnectionSetupSession"("organizationId");
CREATE INDEX "ConnectionSetupSession_pluginId_connectionName_idx" ON "ConnectionSetupSession"("pluginId", "connectionName");
CREATE INDEX "ConnectionSetupSession_status_expiresAt_idx" ON "ConnectionSetupSession"("status", "expiresAt");

ALTER TABLE "ConnectionSetupSession" ADD CONSTRAINT "ConnectionSetupSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
