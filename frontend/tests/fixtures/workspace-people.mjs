const assessment = {
  status: "GOOD",
  confidence: "HIGH",
  summary: "Delivers reviewed changes consistently.",
  positiveSignals: ["Clear handoffs."],
  concerns: [],
  limitations: [],
};
const dimension = { status: "GOOD", summary: "Saved observation." };
export const savedGroupReport = {
  summary: "A steady month of reviewed delivery.",
  overallAssessment: { ...assessment, score: null },
  productAssessment: {
    ticketEvidenceAvailable: false,
    assessment,
    ideation: dimension,
    prioritiesAndScope: dimension,
    ticketFlow: dimension,
    themes: [],
    gaps: [],
  },
  projectAssessment: {
    assessment,
    deliveryFlow: dimension,
    continuity: dimension,
    predictability: dimension,
    projectStages: [],
    risks: [],
    lessons: [],
  },
  engineeringAssessment: {
    assessment,
    traceability: dimension,
    changeDiscipline: dimension,
    reviewability: dimension,
    maintenanceSignals: dimension,
    commitsToReview: [],
  },
  people: [
    {
      displayName: "Lucía Fernández",
      assessment,
      contributionSummary: "Shipped reviewed changes.",
      metrics: [
        { label: "PRs merged", value: "8" },
        { label: "Reviews", value: "6" },
      ],
      consistency: {
        level: "CONSISTENT",
        confidence: "HIGH",
        summary: "Steady participation.",
        limitations: [],
      },
      improvementAreas: [],
      suggestions: ["Share release checks."],
    },
  ],
  evidence: [
    {
      section: "PEOPLE",
      subject: "Lucía Fernández",
      type: "review",
      resource: "repo",
      reference: "142",
      title: "Review #142",
      url: "https://example.test/review/142",
      observation: "Reviewed release checks.",
      interpretation: "A clear handoff.",
    },
  ],
  recommendations: [],
  questionAnswers: [],
  coverage: {
    resourcesAnalyzed: 1,
    datasetsAnalyzed: 1,
    recordsAnalyzed: 12,
    firstActivityAt: "2026-10-01",
    lastActivityAt: "2026-10-31",
    limitations: [],
  },
  period: { from: "2026-10-01", to: "2026-10-31" },
  evaluator: {
    id: "eva-a",
    name: "Balanced",
    avatar: 0,
    scope: "WORKSPACE",
    effort: "MEDIUM",
    personality: "Neutral",
    guidelines: { emphasis: [], notes: null },
    rules: [],
    questions: [],
  },
};
const person = { ...savedGroupReport.people[0], evidence: savedGroupReport.evidence };
export function workspacePeople(evaluatorId = "eva-a") {
  return {
    evaluators: [
      { id: "eva-a", name: "Balanced", avatar: 0, scope: "WORKSPACE", groupId: null },
      { id: "eva-b", name: "Careful", avatar: 1, scope: "GROUP", groupId: "group-a" },
    ],
    evaluatorId,
    groups: [
      {
        id: "group-a",
        name: "Platform team",
        available: true,
        report:
          evaluatorId === "eva-a"
            ? {
                id: "report-people",
                createdAt: "2026-11-02T12:00:00Z",
                updatedAt: "2026-11-02T12:00:00Z",
                period: savedGroupReport.period,
                evaluator: savedGroupReport.evaluator,
                people: [
                  person,
                  {
                    ...person,
                    displayName: "Ana Torres",
                    assessment: {
                      ...assessment,
                      status: "INSUFFICIENT_DATA",
                      summary: "Recent sources are too limited for a reliable assessment.",
                    },
                    metrics: [],
                    evidence: [],
                    suggestions: [],
                  },
                ],
              }
            : null,
      },
      { id: "group-b", name: "Research lab", available: evaluatorId === "eva-a", report: null },
    ],
  };
}
