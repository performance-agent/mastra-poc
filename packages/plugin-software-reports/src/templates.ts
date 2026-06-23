import type { SoftwareReportTemplate } from "./types.js";
import { software } from "@pa/packs-software";

const softwarePackResourceTypes = [
  software.issue.v1,
  software.repository.v1,
  software.pullRequest.v1,
  software.commit.v1,
].map((contract) => canonicalResourceType(contract.id));

export const softwareReportTemplates: readonly SoftwareReportTemplate[] = [
  {
    id: "software-inventory",
    name: "Software Inventory",
    description: "Inventory imported software repositories, issues, pull requests, commits and future software resources.",
    resourceTypes: softwarePackResourceTypes,
  },
  {
    id: "delivery-health",
    name: "Delivery Health",
    description: "Combine issue, pull request, commit and release signals when available.",
    resourceTypes: softwarePackResourceTypes,
  },
  {
    id: "repository-portfolio",
    name: "Repository Portfolio",
    description: "Analyze repository activity, backlog and pull request pressure.",
    resourceTypes: softwarePackResourceTypes,
  },
  {
    id: "engineering-activity",
    name: "Engineering Activity",
    description: "Summarize commits, pull requests and issue updates by provider and repository.",
    resourceTypes: softwarePackResourceTypes,
  },
  {
    id: "executive-summary",
    name: "Executive Summary",
    description: "Concise narrative summary, key metrics, risks, recommendations and data gaps.",
    resourceTypes: softwarePackResourceTypes,
  },
];

export function getSoftwareReportTemplate(id: string): SoftwareReportTemplate | undefined {
  return softwareReportTemplates.find((template) => template.id === id);
}

function canonicalResourceType(contractId: string): string {
  return contractId.replace(".", "_").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}
