import { software } from "@pa/packs-software";
import { permission, definePlugin, defineReport } from "@pa/sdk";

export type IssueInventoryReport = {
  total: number;
  byProvider: Record<string, number>;
  titles: readonly string[];
  records: readonly {
    title: string;
    provider: string;
    resourceId?: string;
  }[];
};

export const issueInventoryReport = defineReport<IssueInventoryReport>({
  async run(ctx) {
    const records = await ctx.data.query(software.issue.v1, { scope: ctx.scope });

    return {
      total: records.length,
      byProvider: records.reduce<Record<string, number>>((counts, record) => {
        counts[record.meta.provider] = (counts[record.meta.provider] ?? 0) + 1;
        return counts;
      }, {}),
      titles: records.map((record) => record.data.title),
      records: records.map((record) => {
        const entry: { title: string; provider: string; resourceId?: string } = {
          title: record.data.title,
          provider: record.meta.provider,
        };
        if (record.meta.resourceId) entry.resourceId = record.meta.resourceId;
        return entry;
      }),
    };
  },
});

export const issueReportPlugin = definePlugin({
  manifest: {
    id: "issue-report",
    name: "Issue Inventory Report",
    version: "1.0.0",
  },
  permissions: [permission.data.read(software.issue.v1), permission.report.write("software.issue_inventory")],
  reports: {
    inventory: issueInventoryReport,
  },
});
