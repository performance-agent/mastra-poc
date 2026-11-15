CREATE TABLE "ReportRevision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportRevision_reportId_idx" ON "ReportRevision"("reportId");

CREATE UNIQUE INDEX "ReportRevision_reportId_position_key" ON "ReportRevision"("reportId", "position");

ALTER TABLE "ReportRevision" ADD CONSTRAINT "ReportRevision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PerformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
