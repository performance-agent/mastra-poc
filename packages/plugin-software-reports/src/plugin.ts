import { software } from "@pa/packs-software";
import { definePlugin, defineReport, permission } from "@pa/sdk";
import { generateSoftwareReport } from "./report-generator.js";

export function createSoftwareReportsPlugin() {
  return definePlugin({
    manifest: {
      id: "software-reports",
      name: "Software Reports",
      version: "0.1.0",
    },
    permissions: [
      permission.data.read(software.issue.v1),
      permission.data.read(software.repository.v1),
      permission.data.read(software.pullRequest.v1),
      permission.data.read(software.commit.v1),
      permission.report.write("software.issue_inventory"),
      permission.report.write("software.delivery_health"),
      permission.report.write("software.executive_summary"),
      permission.report.write("software.inventory"),
      permission.report.write("software.repository_portfolio"),
      permission.report.write("software.engineering_activity"),
    ],
    reports: {
      softwareInventory: defineReport({
        name: "Software Inventory",
        async run(ctx) {
          return generateSoftwareReport(ctx, { templateId: "software-inventory", output: "json" });
        },
      }),
      deliveryHealth: defineReport({
        name: "Delivery Health",
        async run(ctx) {
          return generateSoftwareReport(ctx, { templateId: "delivery-health", output: "json" });
        },
      }),
      repositoryPortfolio: defineReport({
        name: "Repository Portfolio",
        async run(ctx) {
          return generateSoftwareReport(ctx, { templateId: "repository-portfolio", output: "json" });
        },
      }),
      engineeringActivity: defineReport({
        name: "Engineering Activity",
        async run(ctx) {
          return generateSoftwareReport(ctx, { templateId: "engineering-activity", output: "json" });
        },
      }),
      executiveSummary: defineReport({
        name: "Executive Summary",
        async run(ctx) {
          return generateSoftwareReport(ctx, { templateId: "executive-summary", output: "json" });
        },
      }),
    },
  });
}
