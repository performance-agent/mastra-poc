-- CreateTable
CREATE TABLE "DataType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "DataType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataType_organizationId_idx" ON "DataType"("organizationId");

-- AddForeignKey
ALTER TABLE "DataType" ADD CONSTRAINT "DataType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
