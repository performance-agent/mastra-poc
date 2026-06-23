-- New plugin-runtime source-of-truth tables. Legacy tables remain in place.
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "setupKind" TEXT NOT NULL,
    "externalId" TEXT,
    "providerInstallationId" TEXT,
    "cloudId" TEXT,
    "accountLogin" TEXT,
    "accountType" TEXT,
    "accountAvatarUrl" TEXT,
    "accountUrl" TEXT,
    "siteUrl" TEXT,
    "legacyIntegrationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "url" TEXT,
    "legacyResourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CanonicalResource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_legacyIntegrationId_key" ON "IntegrationConnection"("legacyIntegrationId");
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_externalId_key" ON "IntegrationConnection"("organizationId", "provider", "externalId");
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_providerInstallationId_key" ON "IntegrationConnection"("organizationId", "provider", "providerInstallationId");
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_cloudId_key" ON "IntegrationConnection"("organizationId", "provider", "cloudId");
CREATE INDEX "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId");
CREATE INDEX "IntegrationConnection_pluginId_idx" ON "IntegrationConnection"("pluginId");
CREATE INDEX "IntegrationConnection_provider_idx" ON "IntegrationConnection"("provider");
CREATE INDEX "IntegrationConnection_status_idx" ON "IntegrationConnection"("status");

CREATE UNIQUE INDEX "CanonicalResource_legacyResourceId_key" ON "CanonicalResource"("legacyResourceId");
CREATE UNIQUE INDEX "CanonicalResource_organizationId_connectionId_resourceType_externalId_key" ON "CanonicalResource"("organizationId", "connectionId", "resourceType", "externalId");
CREATE INDEX "CanonicalResource_organizationId_idx" ON "CanonicalResource"("organizationId");
CREATE INDEX "CanonicalResource_connectionId_idx" ON "CanonicalResource"("connectionId");
CREATE INDEX "CanonicalResource_provider_idx" ON "CanonicalResource"("provider");
CREATE INDEX "CanonicalResource_resourceType_idx" ON "CanonicalResource"("resourceType");

ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanonicalResource" ADD CONSTRAINT "CanonicalResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanonicalResource" ADD CONSTRAINT "CanonicalResource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotent legacy GitHub adapter data. PostgreSQL ignores duplicate NULLs for these unique keys.
INSERT INTO "IntegrationConnection" (
    "id",
    "organizationId",
    "pluginId",
    "connectionName",
    "provider",
    "status",
    "setupKind",
    "externalId",
    "providerInstallationId",
    "accountLogin",
    "accountType",
    "accountAvatarUrl",
    "accountUrl",
    "legacyIntegrationId",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    i."id",
    i."organizationId",
    'github',
    'github',
    'github',
    CASE
      WHEN i."status" = 'REVOKED' THEN 'disconnected'
      WHEN i."status" = 'DISABLED' THEN 'failed'
      ELSE 'active'
    END,
    'redirect',
    g."installationId",
    g."installationId",
    g."accountLogin",
    g."accountType",
    g."accountAvatarUrl",
    g."accountUrl",
    i."id",
    jsonb_build_object('legacyId', i."id"),
    i."createdAt",
    i."updatedAt"
FROM "Integration" i
JOIN "GithubIntegration" g ON g."integrationId" = i."id"
WHERE i."provider" = 'GITHUB'
ON CONFLICT ("legacyIntegrationId") DO UPDATE SET
    "status" = EXCLUDED."status",
    "externalId" = EXCLUDED."externalId",
    "providerInstallationId" = EXCLUDED."providerInstallationId",
    "accountLogin" = EXCLUDED."accountLogin",
    "accountType" = EXCLUDED."accountType",
    "accountAvatarUrl" = EXCLUDED."accountAvatarUrl",
    "accountUrl" = EXCLUDED."accountUrl",
    "metadata" = EXCLUDED."metadata",
    "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "CanonicalResource" (
    "id",
    "organizationId",
    "connectionId",
    "provider",
    "resourceType",
    "externalId",
    "name",
    "url",
    "legacyResourceId",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    r."id",
    i."organizationId",
    c."id",
    'github',
    'github.repository',
    r."externalId",
    COALESCE(gr."fullName", r."name"),
    gr."htmlUrl",
    r."id",
    jsonb_build_object(
      'legacyId', r."id",
      'providerInstallationId', g."installationId",
      'fullName', gr."fullName",
      'defaultBranch', gr."defaultBranch",
      'isPrivate', gr."isPrivate"
    ),
    r."createdAt",
    r."updatedAt"
FROM "IntegrationResource" r
JOIN "Integration" i ON i."id" = r."integrationId"
JOIN "GithubIntegration" g ON g."integrationId" = i."id"
JOIN "IntegrationConnection" c ON c."legacyIntegrationId" = i."id"
LEFT JOIN "GithubRepository" gr ON gr."resourceId" = r."id"
WHERE i."provider" = 'GITHUB'
ON CONFLICT ("legacyResourceId") DO UPDATE SET
    "connectionId" = EXCLUDED."connectionId",
    "name" = EXCLUDED."name",
    "url" = EXCLUDED."url",
    "metadata" = EXCLUDED."metadata",
    "updatedAt" = EXCLUDED."updatedAt";
