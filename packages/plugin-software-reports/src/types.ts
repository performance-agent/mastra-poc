import type { RuntimeContext } from "@pa/core";

export type SoftwareReportTemplateId =
  | "software-inventory"
  | "delivery-health"
  | "repository-portfolio"
  | "engineering-activity"
  | "executive-summary";

export type SoftwareReportOutputFormat = "json" | "markdown";

export type SoftwareReportTemplate = {
  id: SoftwareReportTemplateId;
  name: string;
  description: string;
  resourceTypes: readonly string[];
};

export type SoftwareReportFilters = {
  provider?: string;
  connectionId?: string;
  resourceTypes?: readonly string[];
  projectKey?: string;
  repositoryId?: string;
  from?: Date;
  to?: Date;
};

export type GenerateSoftwareReportInput = {
  templateId: SoftwareReportTemplateId;
  filters?: SoftwareReportFilters;
  output?: SoftwareReportOutputFormat;
};

export type SoftwareReportMetricValue = string | number | boolean | readonly string[] | Record<string, number>;

export type SoftwareReportSection = {
  title: string;
  body: string;
  metrics?: Record<string, SoftwareReportMetricValue>;
  items?: readonly string[];
};

export type SoftwareReportDataCoverage = {
  availableResourceTypes: readonly string[];
  missingResourceTypes: readonly string[];
  countsByResourceType: Record<string, number>;
};

export type SoftwareReport = {
  reportId?: string;
  templateId: SoftwareReportTemplateId;
  title: string;
  summary: string;
  dataCoverage: SoftwareReportDataCoverage;
  metrics: Record<string, SoftwareReportMetricValue>;
  sections: readonly SoftwareReportSection[];
  markdown?: string;
};

export type SoftwareReportRuntimeContext = RuntimeContext<Record<string, never>>;
