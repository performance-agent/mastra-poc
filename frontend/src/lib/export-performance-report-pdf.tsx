/* eslint-disable react-refresh/only-export-components -- This lazy utility intentionally keeps its private PDF components with the export function. */
import { Document, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import type { ReactNode } from "react";
import type {
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  GroupReportAssessment,
  GroupReportDimensionAssessment,
  GroupReportEvidence,
  PerformanceReport,
} from "@/lib/types";

type ExportableReport = PerformanceReport<
  GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport
>;

type Tone = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

type MetricItem = {
  label: string;
  value: string | number | boolean | null | undefined;
};

type WorkItem = {
  type: string;
  repository: string;
  number: number | null;
  title: string;
  url: string;
  reason: string;
  status?: string;
};

const tones = {
  neutral: { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1", color: "#334155" },
  good: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" },
  watch: { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#b45309" },
  risk: { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" },
} satisfies Record<string, Tone>;

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingRight: 38,
    paddingBottom: 48,
    paddingLeft: 38,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0f172a",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 14,
    marginBottom: 18,
  },
  eyebrow: {
    color: "#64748b",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginTop: 5,
  },
  subtitle: {
    color: "#334155",
    fontSize: 10,
    marginTop: 5,
  },
  metadata: {
    marginTop: 10,
  },
  metadataText: {
    color: "#64748b",
    fontSize: 8,
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 7,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 5,
    padding: 10,
    marginBottom: 7,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  body: {
    color: "#334155",
    marginBottom: 4,
  },
  strong: {
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 4,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 4,
    marginBottom: 3,
  },
  pillText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
    marginTop: 4,
  },
  metric: {
    width: "33.333%",
    paddingHorizontal: 3,
    marginBottom: 6,
  },
  metricInner: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 7,
    backgroundColor: "#f8fafc",
  },
  metricValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 7,
    marginTop: 2,
  },
  list: {
    marginTop: 5,
    marginBottom: 2,
  },
  listTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginBottom: 3,
  },
  listItem: {
    color: "#334155",
    marginBottom: 2,
    paddingLeft: 7,
  },
  field: {
    flexDirection: "row",
    marginBottom: 3,
  },
  fieldLabel: {
    width: 105,
    flexShrink: 0,
    color: "#64748b",
    fontSize: 8,
  },
  fieldValue: {
    flexGrow: 1,
    flexShrink: 1,
    color: "#334155",
    fontSize: 8,
  },
  link: {
    color: "#2563eb",
    fontSize: 8,
    textDecoration: "none",
    marginTop: 3,
  },
  action: {
    borderLeftWidth: 2,
    borderLeftColor: "#2563eb",
    paddingLeft: 7,
    marginTop: 5,
    color: "#1e3a8a",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 38,
    right: 38,
    height: 10,
    color: "#94a3b8",
    fontSize: 7,
    textAlign: "center",
  },
});

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function reportTitle(type: ExportableReport["type"]) {
  if (type === "GROUP_REPORT") return "Group report";
  if (type === "GITHUB_HISTORY") return "GitHub history report";
  return "GitHub activity report";
}

function reportSlug(type: ExportableReport["type"]) {
  if (type === "GROUP_REPORT") return "group-report";
  if (type === "GITHUB_HISTORY") return "github-history";
  return "github-activity";
}

function displayValue(value: MetricItem["value"]) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatGeneratedAt(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toneForStatus(value: string) {
  if (value === "GOOD") return tones.good;
  if (value === "WATCH") return tones.watch;
  if (value === "RISK") return tones.risk;
  return tones.neutral;
}

function toneForConfidence(value: string) {
  if (value === "HIGH") return tones.good;
  if (value === "MEDIUM") return tones.watch;
  return tones.neutral;
}

function toneForPriority(value: string) {
  if (value === "HIGH") return tones.risk;
  if (value === "MEDIUM") return tones.watch;
  return tones.good;
}

function Pill({ label, tone = tones.neutral }: { label: string; tone?: Tone }) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
      ]}
    >
      <Text style={[styles.pillText, { color: tone.color }]}>{label}</Text>
    </View>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} minPresenceAhead={28}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Fields({ items }: { items: MetricItem[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.field} wrap={false}>
          <Text style={styles.fieldLabel}>{item.label}</Text>
          <Text style={styles.fieldValue}>{displayValue(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function Metrics({ items }: { items: MetricItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.metrics}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.metric} wrap={false}>
          <View style={styles.metricInner}>
            <Text style={styles.metricValue}>{displayValue(item.value)}</Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.list}>
      <Text style={styles.listTitle} minPresenceAhead={12}>
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.listItem}>
          {`• ${item}`}
        </Text>
      ))}
    </View>
  );
}

function Assessment({ assessment }: { assessment: GroupReportAssessment }) {
  return (
    <View>
      <View style={styles.row}>
        <Pill label={titleCase(assessment.status)} tone={toneForStatus(assessment.status)} />
        <Pill
          label={`${titleCase(assessment.confidence)} confidence`}
          tone={toneForConfidence(assessment.confidence)}
        />
      </View>
      <Text style={styles.body}>{assessment.summary}</Text>
      <ListBlock title="Positive signals" items={assessment.positiveSignals} />
      <ListBlock title="Concerns" items={assessment.concerns} />
      <ListBlock title="Limitations" items={assessment.limitations} />
    </View>
  );
}

function Dimension({
  title,
  assessment,
}: {
  title: string;
  assessment: GroupReportDimensionAssessment;
}) {
  return (
    <Card title={title}>
      <View style={styles.row}>
        <Pill label={titleCase(assessment.status)} tone={toneForStatus(assessment.status)} />
      </View>
      <Text style={styles.body}>{assessment.summary}</Text>
    </Card>
  );
}

function Evidence({ evidence }: { evidence: GroupReportEvidence }) {
  return (
    <Card title={evidence.title}>
      <View style={styles.row}>
        <Pill label={titleCase(evidence.section)} />
        <Pill label={titleCase(evidence.type)} />
      </View>
      <Fields
        items={[
          { label: "Subject", value: evidence.subject },
          { label: "Resource", value: evidence.resource },
          { label: "Reference", value: evidence.reference },
        ]}
      />
      <ListBlock title="Observation" items={[evidence.observation]} />
      <ListBlock title="Interpretation" items={[evidence.interpretation]} />
      {evidence.url ? (
        <Link src={evidence.url} style={styles.link}>
          Open evidence source
        </Link>
      ) : null}
    </Card>
  );
}

function Recommendation({
  recommendation,
}: {
  recommendation: GroupReport["recommendations"][number];
}) {
  return (
    <Card title={recommendation.title}>
      <View style={styles.row}>
        <Pill
          label={`${titleCase(recommendation.priority)} priority`}
          tone={toneForPriority(recommendation.priority)}
        />
      </View>
      <Text style={styles.body}>{recommendation.description}</Text>
      <Text style={styles.action}>{recommendation.action}</Text>
    </Card>
  );
}

function WorkItemCard({ item }: { item: WorkItem }) {
  const heading = `${item.repository}${item.number ? ` #${item.number}` : ""}: ${item.title}`;
  return (
    <Card title={heading}>
      <View style={styles.row}>
        <Pill label={titleCase(item.type)} />
        {item.status ? (
          <Pill label={titleCase(item.status)} tone={toneForStatus(item.status)} />
        ) : null}
      </View>
      <Text style={styles.body}>{item.reason}</Text>
      {item.url ? (
        <Link src={item.url} style={styles.link}>
          Open work item
        </Link>
      ) : null}
    </Card>
  );
}

function InsightCard({
  title,
  insight,
}: {
  title: string;
  insight: {
    status: string;
    summary: string;
    signals?: string[];
    risks?: string[];
    lessons?: string[];
  };
}) {
  return (
    <Card title={title}>
      <View style={styles.row}>
        <Pill label={titleCase(insight.status)} tone={toneForStatus(insight.status)} />
      </View>
      <Text style={styles.body}>{insight.summary}</Text>
      <ListBlock title="Signals" items={insight.signals ?? []} />
      <ListBlock title="Risks" items={insight.risks ?? []} />
      <ListBlock title="Lessons" items={insight.lessons ?? []} />
    </Card>
  );
}

function GroupReportContent({ data }: { data: GroupReport }) {
  return (
    <>
      <Section title="Overall assessment">
        <Card>
          <Metrics items={[{ label: "Overall score", value: data.overallAssessment.score }]} />
          <Assessment assessment={data.overallAssessment} />
        </Card>
      </Section>

      <Section title="Coverage">
        <Metrics
          items={[
            { label: "Resources analyzed", value: data.coverage.resourcesAnalyzed },
            { label: "Datasets analyzed", value: data.coverage.datasetsAnalyzed },
            { label: "Records analyzed", value: data.coverage.recordsAnalyzed },
          ]}
        />
        <Card>
          <Fields
            items={[
              { label: "First activity", value: data.coverage.firstActivityAt },
              { label: "Last activity", value: data.coverage.lastActivityAt },
            ]}
          />
          <ListBlock title="Limitations" items={data.coverage.limitations} />
        </Card>
      </Section>

      {data.evaluationGuidelines &&
      (data.evaluationGuidelines.emphasis.length || data.evaluationGuidelines.notes) ? (
        <Section title="Evaluation guidelines">
          <Card>
            <ListBlock title="Emphasis" items={data.evaluationGuidelines.emphasis.map(titleCase)} />
            {data.evaluationGuidelines.notes ? (
              <ListBlock title="Notes" items={[data.evaluationGuidelines.notes]} />
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Product and ideation">
        <Card title="Product assessment">
          <Fields
            items={[
              {
                label: "Ticket evidence",
                value: data.productAssessment.ticketEvidenceAvailable,
              },
            ]}
          />
          <Assessment assessment={data.productAssessment.assessment} />
        </Card>
        <Dimension title="Ideation" assessment={data.productAssessment.ideation} />
        <Dimension
          title="Priorities and scope"
          assessment={data.productAssessment.prioritiesAndScope}
        />
        <Dimension title="Ticket flow" assessment={data.productAssessment.ticketFlow} />
        {data.productAssessment.themes.map((theme, index) => (
          <Card key={`${theme.name}-${index}`} title={theme.name}>
            <Text style={styles.body}>{theme.evolution}</Text>
          </Card>
        ))}
        <ListBlock title="Observed gaps" items={data.productAssessment.gaps} />
      </Section>

      <Section title="Project execution">
        <Card title="Project assessment">
          <Assessment assessment={data.projectAssessment.assessment} />
        </Card>
        <Dimension title="Delivery flow" assessment={data.projectAssessment.deliveryFlow} />
        <Dimension title="Continuity" assessment={data.projectAssessment.continuity} />
        <Dimension title="Predictability" assessment={data.projectAssessment.predictability} />
        {data.projectAssessment.projectStages.map((stage, index) => (
          <Card key={`${stage.label}-${stage.period}-${index}`} title={stage.label}>
            <View style={styles.row}>
              <Pill label={stage.period} />
              <Pill label={titleCase(stage.status)} tone={toneForStatus(stage.status)} />
            </View>
            <Text style={styles.body}>{stage.summary}</Text>
          </Card>
        ))}
        <ListBlock title="Project risks" items={data.projectAssessment.risks} />
        <ListBlock title="Lessons" items={data.projectAssessment.lessons} />
      </Section>

      <Section title="Engineering">
        <Card title="Engineering assessment">
          <Assessment assessment={data.engineeringAssessment.assessment} />
        </Card>
        <Dimension title="Traceability" assessment={data.engineeringAssessment.traceability} />
        <Dimension
          title="Change discipline"
          assessment={data.engineeringAssessment.changeDiscipline}
        />
        <Dimension title="Reviewability" assessment={data.engineeringAssessment.reviewability} />
        <Dimension
          title="Maintenance signals"
          assessment={data.engineeringAssessment.maintenanceSignals}
        />
        {data.engineeringAssessment.commitsToReview.map((commit, index) => (
          <Card
            key={`${commit.resource}-${commit.reference ?? commit.message}-${index}`}
            title={commit.message}
          >
            <View style={styles.row}>
              <Pill label={titleCase(commit.status)} tone={toneForStatus(commit.status)} />
              <Pill
                label={`${titleCase(commit.confidence)} confidence`}
                tone={toneForConfidence(commit.confidence)}
              />
            </View>
            <Fields
              items={[
                { label: "Resource", value: commit.resource },
                { label: "Reference", value: commit.reference },
                { label: "Author", value: commit.author },
              ]}
            />
            <ListBlock title="Signals" items={commit.signals} />
            <ListBlock title="Explanation" items={[commit.explanation]} />
            <Text style={styles.action}>{commit.recommendedAction}</Text>
            {commit.url ? (
              <Link src={commit.url} style={styles.link}>
                Open commit
              </Link>
            ) : null}
          </Card>
        ))}
      </Section>

      {data.people.length ? (
        <Section title="People">
          {data.people.map((person, index) => (
            <Card key={`${person.displayName}-${index}`} title={person.displayName}>
              <Text style={styles.body}>{person.contributionSummary}</Text>
              <Assessment assessment={person.assessment} />
              <Metrics items={person.metrics} />
              <View style={styles.row}>
                <Pill label={`${titleCase(person.consistency.level)} consistency`} />
                <Pill
                  label={`${titleCase(person.consistency.confidence)} confidence`}
                  tone={toneForConfidence(person.consistency.confidence)}
                />
              </View>
              <Text style={styles.body}>{person.consistency.summary}</Text>
              <ListBlock title="Consistency limitations" items={person.consistency.limitations} />
              <ListBlock title="Improvement areas" items={person.improvementAreas} />
              <ListBlock title="Suggestions" items={person.suggestions} />
            </Card>
          ))}
        </Section>
      ) : null}

      {data.evidence.length ? (
        <Section title="Evidence">
          {data.evidence.map((evidence, index) => (
            <Evidence key={`${evidence.section}-${evidence.title}-${index}`} evidence={evidence} />
          ))}
        </Section>
      ) : null}

      {data.recommendations.length ? (
        <Section title="Recommendations">
          {data.recommendations.map((recommendation, index) => (
            <Recommendation
              key={`${recommendation.title}-${index}`}
              recommendation={recommendation}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function ActivityPerson({ person }: { person: GroupGithubActivityReport["people"][number] }) {
  return (
    <Card title={`@${person.githubLogin}`}>
      <View style={styles.row}>
        <Pill label={titleCase(person.contributionProfile)} />
      </View>
      <Text style={styles.body}>{person.summary}</Text>
      <Metrics
        items={[
          { label: "Opened pull requests", value: person.metrics.openedPullRequests },
          { label: "Merged pull requests", value: person.metrics.mergedPullRequests },
          { label: "Open pull requests", value: person.metrics.openPullRequests },
          { label: "Stale pull requests", value: person.metrics.stalePullRequests },
          { label: "Opened issues", value: person.metrics.openedIssues },
          { label: "Closed issues", value: person.metrics.closedIssues },
          { label: "Comments", value: person.metrics.comments },
          { label: "Review comments", value: person.metrics.reviewComments },
          { label: "Commits", value: person.metrics.commits },
        ]}
      />
      <ListBlock title="Strengths" items={person.strengths} />
      <ListBlock title="Risks" items={person.risks} />
      <ListBlock title="Suggested actions" items={person.suggestedActions} />
      {person.notableItems.map((item, index) => (
        <WorkItemCard key={`${item.repository}-${item.title}-${index}`} item={item} />
      ))}
    </Card>
  );
}

function GithubActivityContent({ data }: { data: GroupGithubActivityReport }) {
  return (
    <>
      <Section title="Health">
        <Card>
          <Metrics items={[{ label: "Score", value: data.health.score }]} />
          <View style={styles.row}>
            <Pill label={titleCase(data.health.status)} tone={toneForStatus(data.health.status)} />
          </View>
          <Text style={styles.body}>{data.health.summary}</Text>
        </Card>
      </Section>

      <Section title="Group insights">
        <InsightCard title="Delivery momentum" insight={data.groupInsights.deliveryMomentum} />
        <InsightCard title="Collaboration" insight={data.groupInsights.collaboration} />
        <InsightCard title="Risk and bottlenecks" insight={data.groupInsights.riskAndBottlenecks} />
        <InsightCard title="Focus" insight={data.groupInsights.focus} />
      </Section>

      {data.people.length ? (
        <Section title="People">
          {data.people.map((person) => (
            <ActivityPerson key={person.githubLogin} person={person} />
          ))}
        </Section>
      ) : null}

      {data.notableWork.length ? (
        <Section title="Notable work">
          {data.notableWork.map((item, index) => (
            <WorkItemCard key={`${item.repository}-${item.title}-${index}`} item={item} />
          ))}
        </Section>
      ) : null}

      {data.recommendations.length ? (
        <Section title="Recommendations">
          {data.recommendations.map((recommendation, index) => (
            <Recommendation
              key={`${recommendation.title}-${index}`}
              recommendation={recommendation}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Raw signals">
        <Metrics
          items={[
            { label: "Repositories analyzed", value: data.rawSignals.repositoriesAnalyzed },
            { label: "Open pull requests", value: data.rawSignals.openPullRequests },
            { label: "Merged pull requests", value: data.rawSignals.mergedPullRequests },
            { label: "Open issues", value: data.rawSignals.openIssues },
            { label: "Closed issues", value: data.rawSignals.closedIssues },
            { label: "Stale pull requests", value: data.rawSignals.stalePullRequests },
            { label: "Recent commits", value: data.rawSignals.recentCommits },
          ]}
        />
      </Section>
    </>
  );
}

function HistoryPerson({ person }: { person: GroupGithubHistoryReport["people"][number] }) {
  return (
    <Card title={`@${person.githubLogin}`}>
      <View style={styles.row}>
        <Pill label={titleCase(person.contributionProfile)} />
      </View>
      <Text style={styles.body}>{person.summary}</Text>
      <Metrics
        items={[
          { label: "Commits", value: person.metrics.commits },
          { label: "Opened pull requests", value: person.metrics.openedPullRequests },
          { label: "Merged pull requests", value: person.metrics.mergedPullRequests },
          { label: "Closed issues", value: person.metrics.closedIssues },
          { label: "Comments", value: person.metrics.comments },
          { label: "Review comments", value: person.metrics.reviewComments },
        ]}
      />
      <ListBlock title="Strengths" items={person.strengths} />
      <ListBlock title="Risks" items={person.risks} />
      <ListBlock title="Suggested actions" items={person.suggestedActions} />
      {person.notableItems.map((item, index) => (
        <WorkItemCard key={`${item.repository}-${item.title}-${index}`} item={item} />
      ))}
    </Card>
  );
}

function GithubHistoryContent({ data }: { data: GroupGithubHistoryReport }) {
  return (
    <>
      <Section title="Health">
        <Card>
          <Metrics items={[{ label: "Score", value: data.health.score }]} />
          <View style={styles.row}>
            <Pill label={titleCase(data.health.status)} tone={toneForStatus(data.health.status)} />
          </View>
          <Text style={styles.body}>{data.health.summary}</Text>
        </Card>
      </Section>

      <Section title="Historical insights">
        <InsightCard title="Delivery flow" insight={data.historicalInsights.deliveryFlow} />
        <InsightCard title="Collaboration" insight={data.historicalInsights.collaboration} />
        <InsightCard title="Ownership" insight={data.historicalInsights.ownership} />
        <InsightCard title="Risks and lessons" insight={data.historicalInsights.riskAndLessons} />
      </Section>

      {data.projectStages.length ? (
        <Section title="Project stages">
          {data.projectStages.map((stage, index) => (
            <Card key={`${stage.label}-${stage.period}-${index}`} title={stage.label}>
              <View style={styles.row}>
                <Pill label={stage.period} />
              </View>
              <Text style={styles.body}>{stage.summary}</Text>
              <ListBlock title="Signals" items={stage.signals} />
            </Card>
          ))}
        </Section>
      ) : null}

      {data.people.length ? (
        <Section title="People">
          {data.people.map((person) => (
            <HistoryPerson key={person.githubLogin} person={person} />
          ))}
        </Section>
      ) : null}

      {data.notableWork.length ? (
        <Section title="Notable work">
          {data.notableWork.map((item, index) => (
            <WorkItemCard key={`${item.repository}-${item.title}-${index}`} item={item} />
          ))}
        </Section>
      ) : null}

      {data.recommendations.length ? (
        <Section title="Recommendations">
          {data.recommendations.map((recommendation, index) => (
            <Recommendation
              key={`${recommendation.title}-${index}`}
              recommendation={recommendation}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Raw signals">
        <Metrics
          items={[
            { label: "Repositories analyzed", value: data.rawSignals.repositoriesAnalyzed },
            { label: "First activity", value: data.rawSignals.firstActivityAt },
            { label: "Last activity", value: data.rawSignals.lastActivityAt },
            { label: "Pull requests analyzed", value: data.rawSignals.pullRequestsAnalyzed },
            { label: "Pull requests merged", value: data.rawSignals.pullRequestsMerged },
            {
              label: "Pull requests closed unmerged",
              value: data.rawSignals.pullRequestsClosedUnmerged,
            },
            { label: "Issues analyzed", value: data.rawSignals.issuesAnalyzed },
            { label: "Issues closed", value: data.rawSignals.issuesClosed },
            { label: "Commits analyzed", value: data.rawSignals.commitsAnalyzed },
            { label: "Commit weeks analyzed", value: data.rawSignals.commitWeeksAnalyzed },
          ]}
        />
      </Section>
    </>
  );
}

function reportSummary(report: ExportableReport) {
  return (report.data as GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport)
    .summary;
}

function ReportContent({ report }: { report: ExportableReport }) {
  if (report.type === "GROUP_REPORT") {
    return <GroupReportContent data={report.data as GroupReport} />;
  }
  if (report.type === "GITHUB_HISTORY") {
    return <GithubHistoryContent data={report.data as GroupGithubHistoryReport} />;
  }
  return <GithubActivityContent data={report.data as GroupGithubActivityReport} />;
}

function PerformanceReportPdfDocument({
  report,
  groupName,
  includePageNumbers = true,
}: {
  report: ExportableReport;
  groupName: string;
  includePageNumbers?: boolean;
}) {
  const title = reportTitle(report.type);
  return (
    <Document
      title={`${groupName} - ${title}`}
      author="Platformance"
      creator="Platformance"
      subject={`${title} for ${groupName}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Platformance performance report</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{groupName}</Text>
          <View style={styles.metadata}>
            <Text style={styles.metadataText}>
              Generated: {formatGeneratedAt(report.createdAt)}
            </Text>
            <Text style={styles.metadataText}>Report ID: {report.id}</Text>
          </View>
          <Text style={[styles.body, { marginTop: 10 }]}>{reportSummary(report)}</Text>
        </View>

        <ReportContent report={report} />

        {includePageNumbers ? (
          <Text
            style={styles.footer}
            fixed
            render={({ pageNumber, totalPages }) =>
              `${groupName} · ${title} · Page ${pageNumber} of ${totalPages}`
            }
          />
        ) : null}
      </Page>
    </Document>
  );
}

function sanitizeFilePart(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function buildPerformanceReportPdfFilename(report: ExportableReport, groupName: string) {
  const date = report.createdAt ? new Date(report.createdAt) : null;
  const suffix =
    date && !Number.isNaN(date.getTime())
      ? date.toISOString().slice(0, 10)
      : sanitizeFilePart(report.id, "report");
  return `${sanitizeFilePart(groupName, "group")}-${reportSlug(report.type)}-${suffix}.pdf`;
}

export async function exportPerformanceReportAsPdf({
  report,
  groupName,
}: {
  report: ExportableReport;
  groupName: string;
}) {
  let objectUrl: string | null = null;
  try {
    let blob: Blob;
    try {
      blob = await pdf(
        <PerformanceReportPdfDocument report={report} groupName={groupName} />,
      ).toBlob();
    } catch (renderError) {
      const message = renderError instanceof Error ? renderError.message : String(renderError);
      if (!message.includes("unsupported number")) throw renderError;
      blob = await pdf(
        <PerformanceReportPdfDocument
          report={report}
          groupName={groupName}
          includePageNumbers={false}
        />,
      ).toBlob();
    }
    objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = buildPerformanceReportPdfFilename(report, groupName);
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    if (objectUrl) {
      const urlToRevoke = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000);
    }
  }
}
