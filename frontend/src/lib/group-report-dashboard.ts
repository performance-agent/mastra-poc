import type {
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  GroupReportConfidence,
  GroupReportStatus,
  PerformanceReport,
} from "@/lib/types";

export type GroupPerformanceReport = PerformanceReport<GroupReport> & { type: "GROUP_REPORT" };

export type GroupReportSource = PerformanceReport<
  GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport
>;

export type GroupReportConsistencyLevel = GroupReport["people"][number]["consistency"]["level"];

export interface GroupReportDashboardData {
  reports: GroupPerformanceReport[];
  latest: GroupPerformanceReport | null;
  previous: GroupPerformanceReport | null;
  scoreHistory: Array<{
    id: string;
    createdAt: string | undefined;
    score: number;
  }>;
  dimensions: Array<{
    label: string;
    current: GroupReportStatus;
  }>;
  peopleDistribution: Record<GroupReportStatus, number>;
  consistencyDistribution: Record<GroupReportConsistencyLevel, number>;
  confidenceDistribution: Record<GroupReportConfidence, number>;
}

const emptyDistribution = (): Record<GroupReportStatus, number> => ({
  GOOD: 0,
  WATCH: 0,
  RISK: 0,
  INSUFFICIENT_DATA: 0,
});

const emptyConsistencyDistribution = (): Record<GroupReportConsistencyLevel, number> => ({
  CONSISTENT: 0,
  VARIABLE: 0,
  SPORADIC: 0,
  INSUFFICIENT_DATA: 0,
});

const emptyConfidenceDistribution = (): Record<GroupReportConfidence, number> => ({
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0,
  INSUFFICIENT: 0,
});

function timestamp(report: GroupPerformanceReport) {
  if (!report.createdAt) return 0;
  const value = new Date(report.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function isGroupPerformanceReport(
  report: GroupReportSource,
): report is GroupPerformanceReport {
  return report.type === "GROUP_REPORT";
}

export function buildGroupReportDashboardData(
  sourceReports: GroupReportSource[],
): GroupReportDashboardData {
  const reports = sourceReports
    .filter(isGroupPerformanceReport)
    .map((report) => ({
      ...report,
      data:
        Array.isArray(report.data.blocks) && report.data.blocks.length > 0
          ? (Object.assign({}, ...report.data.blocks) as GroupReport)
          : report.data,
    }))
    .filter((report) => report.data.overallAssessment)
    .sort((left, right) => timestamp(right) - timestamp(left));
  const latest = reports[0] ?? null;
  const previous = reports[1] ?? null;

  if (!latest) {
    return {
      reports,
      latest,
      previous,
      scoreHistory: [],
      dimensions: [],
      peopleDistribution: emptyDistribution(),
      consistencyDistribution: emptyConsistencyDistribution(),
      confidenceDistribution: emptyConfidenceDistribution(),
    };
  }

  const scoreHistory = reports
    .filter(
      (
        report,
      ): report is GroupPerformanceReport & {
        data: GroupReport & {
          overallAssessment: GroupReport["overallAssessment"] & { score: number };
        };
      } =>
        typeof report.data.overallAssessment.score === "number" &&
        Number.isFinite(report.data.overallAssessment.score),
    )
    .map((report) => ({
      id: report.id,
      createdAt: report.createdAt,
      score: report.data.overallAssessment.score,
    }))
    .reverse();

  const dimensions = [
    {
      label: "Product",
      current: latest.data.productAssessment?.assessment.status,
    },
    {
      label: "Project",
      current: latest.data.projectAssessment?.assessment.status,
    },
    {
      label: "Engineering",
      current: latest.data.engineeringAssessment?.assessment.status,
    },
  ].filter((dimension) => dimension.current !== undefined);

  const peopleDistribution = (latest.data.people ?? []).reduce((distribution, person) => {
    distribution[person.assessment.status] += 1;
    return distribution;
  }, emptyDistribution());
  const consistencyDistribution = (latest.data.people ?? []).reduce((distribution, person) => {
    distribution[person.consistency.level] += 1;
    return distribution;
  }, emptyConsistencyDistribution());
  const confidenceDistribution = (latest.data.people ?? []).reduce((distribution, person) => {
    distribution[person.assessment.confidence] += 1;
    return distribution;
  }, emptyConfidenceDistribution());

  return {
    reports,
    latest,
    previous,
    scoreHistory,
    dimensions,
    peopleDistribution,
    consistencyDistribution,
    confidenceDistribution,
  };
}
