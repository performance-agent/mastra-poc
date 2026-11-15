import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import type {
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  PerformanceReport,
} from "@/lib/types";

export function ReportPdfExportButton({
  report,
  groupName,
}: {
  report: PerformanceReport<GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport>;
  groupName: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportPerformanceReportAsPdf } = await import("@/lib/export-performance-report-pdf");
      await exportPerformanceReportAsPdf({ report, groupName });
    } catch (error) {
      toast.error(`Could not export PDF: ${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={exporting}
      onClick={() => void exportPdf()}
    >
      <Download aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
      {exporting ? "Exporting PDF…" : "Export PDF"}
    </Button>
  );
}
