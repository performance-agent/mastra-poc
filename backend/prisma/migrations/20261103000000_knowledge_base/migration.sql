CREATE TABLE "KnowledgeNode" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "groupId" TEXT,
  "parentId" TEXT, "connectionId" TEXT, "externalId" TEXT,
  "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'UPLOAD', "usage" TEXT NOT NULL DEFAULT 'CONTEXT',
  "status" TEXT NOT NULL DEFAULT 'PROCESSING', "mimeType" TEXT,
  "bytes" INTEGER NOT NULL DEFAULT 0, "sourceUrl" TEXT, "sourceRevision" TEXT,
  "pendingObjectPath" TEXT, "processingLeaseUntil" TIMESTAMPTZ(3), "error" TEXT,
  "syncedAt" TIMESTAMPTZ(3), "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "KnowledgeNode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeNode_kind_check" CHECK ("kind" IN ('FOLDER','DOCUMENT')),
  CONSTRAINT "KnowledgeNode_usage_check" CHECK ("usage" IN ('CONTEXT','EVIDENCE','BOTH')),
  CONSTRAINT "KnowledgeNode_status_check" CHECK ("status" IN ('PROCESSING','READY','ERROR','UNAVAILABLE')),
  CONSTRAINT "KnowledgeNode_origin_check" CHECK ("origin" IN ('UPLOAD','GOOGLE_DRIVE'))
);
CREATE TABLE "KnowledgeVersion" (
  "id" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "revision" TEXT NOT NULL,
  "digest" TEXT NOT NULL, "text" TEXT NOT NULL, "objectPath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "bytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeExclusion" (
  "groupId" TEXT NOT NULL, "nodeId" TEXT NOT NULL,
  CONSTRAINT "KnowledgeExclusion_pkey" PRIMARY KEY ("groupId","nodeId")
);
CREATE TABLE "KnowledgeConnection" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "groupId" TEXT,
  "ownerId" TEXT NOT NULL, "email" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "credentials" JSONB NOT NULL, "rootIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "destinationId" TEXT, "usage" TEXT NOT NULL DEFAULT 'CONTEXT',
  "status" TEXT NOT NULL DEFAULT 'CONNECTED', "lastSyncedAt" TIMESTAMPTZ(3),
  "nextSyncAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMPTZ(3),
  "error" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "KnowledgeConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeOAuthState" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "groupId" TEXT, "connectionId" TEXT, "verifier" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "KnowledgeOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeReportContext" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "groupId" TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeReportContext_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeReportContext_expiresAt_idx" ON "KnowledgeReportContext"("expiresAt");
CREATE UNIQUE INDEX "KnowledgeNode_connectionId_externalId_key" ON "KnowledgeNode"("connectionId","externalId");
CREATE INDEX "KnowledgeNode_workspaceId_groupId_deletedAt_idx" ON "KnowledgeNode"("workspaceId","groupId","deletedAt");
CREATE INDEX "KnowledgeNode_parentId_idx" ON "KnowledgeNode"("parentId");
CREATE INDEX "KnowledgeNode_status_processingLeaseUntil_idx" ON "KnowledgeNode"("status","processingLeaseUntil");
CREATE UNIQUE INDEX "KnowledgeVersion_nodeId_revision_key" ON "KnowledgeVersion"("nodeId","revision");
CREATE INDEX "KnowledgeVersion_nodeId_createdAt_idx" ON "KnowledgeVersion"("nodeId","createdAt");
CREATE INDEX "KnowledgeConnection_workspaceId_groupId_idx" ON "KnowledgeConnection"("workspaceId","groupId");
CREATE INDEX "KnowledgeConnection_status_nextSyncAt_idx" ON "KnowledgeConnection"("status","nextSyncAt");
ALTER TABLE "KnowledgeNode" ADD CONSTRAINT "KnowledgeNode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeNode" ADD CONSTRAINT "KnowledgeNode_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeNode" ADD CONSTRAINT "KnowledgeNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeNode" ADD CONSTRAINT "KnowledgeNode_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "KnowledgeConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeVersion" ADD CONSTRAINT "KnowledgeVersion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeExclusion" ADD CONSTRAINT "KnowledgeExclusion_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeExclusion" ADD CONSTRAINT "KnowledgeExclusion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeConnection" ADD CONSTRAINT "KnowledgeConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeConnection" ADD CONSTRAINT "KnowledgeConnection_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
