import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  GroupReport,
  GroupReportAssessment,
  GroupReportConfidence,
  GroupReportDimensionAssessment,
  GroupReportEvidence,
  GroupReportStatus,
  PerformanceReport,
} from "@/lib/types";
import { EMPHASIS_LABELS, type EvaluationEmphasis } from "@/lib/evaluation-guidelines";
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  report: PerformanceReport<GroupReport>;
  onBack?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  onRename?: (title: string | null) => void;
};

type CommitReview = GroupReport["engineeringAssessment"]["commitsToReview"][number];

const statusLabels: Record<GroupReportStatus, string> = {
  GOOD: "Bien",
  WATCH: "Atención",
  RISK: "Riesgo",
  INSUFFICIENT_DATA: "Datos insuficientes",
};

const confidenceLabels: Record<GroupReportConfidence, string> = {
  HIGH: "Confianza alta",
  MEDIUM: "Confianza media",
  LOW: "Confianza baja",
  INSUFFICIENT: "Confianza insuficiente",
};

const consistencyLabels: Record<GroupReport["people"][number]["consistency"]["level"], string> = {
  CONSISTENT: "Constante",
  VARIABLE: "Variable",
  SPORADIC: "Esporádica",
  INSUFFICIENT_DATA: "Datos insuficientes",
};

function statusClasses(status: GroupReportStatus) {
  if (status === "GOOD") return "border-success/20 bg-success/10 text-success";
  if (status === "WATCH") return "border-warning/25 bg-warning/10 text-warning";
  if (status === "RISK") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted text-muted-foreground";
}

function confidenceClasses(confidence: GroupReportConfidence) {
  if (confidence === "HIGH") return "border-success/20 bg-success/10 text-success";
  if (confidence === "MEDIUM") return "border-warning/25 bg-warning/10 text-warning";
  if (confidence === "LOW") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted text-muted-foreground";
}

function priorityClasses(priority: "HIGH" | "MEDIUM" | "LOW") {
  if (priority === "HIGH") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  if (priority === "MEDIUM") return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/20 bg-success/10 text-success";
}

function priorityLabel(priority: "HIGH" | "MEDIUM" | "LOW") {
  if (priority === "HIGH") return "Alta";
  if (priority === "MEDIUM") return "Media";
  return "Baja";
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function AssessmentBadges({ assessment }: { assessment: GroupReportAssessment }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className={statusClasses(assessment.status)}>{statusLabels[assessment.status]}</Badge>
      <Badge className={confidenceClasses(assessment.confidence)}>
        {confidenceLabels[assessment.confidence]}
      </Badge>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2">
      <div className="wrap-break-word text-lg font-semibold">{value}</div>
      <div className="wrap-break-word text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="mt-2 space-y-1 wrap-break-word text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceContent({ evidence }: { evidence: GroupReportEvidence }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-border bg-muted text-muted-foreground">{evidence.type}</Badge>
          <span className="break-all text-[11px] text-muted-foreground">
            {evidence.resource}
            {evidence.reference ? ` · ${evidence.reference}` : ""}
            {evidence.subject ? ` · ${evidence.subject}` : ""}
          </span>
        </div>
        <h5 className="mt-2 wrap-break-word text-sm font-semibold">{evidence.title}</h5>
        <p className="mt-1 wrap-break-word text-xs text-muted-foreground">{evidence.observation}</p>
        <p className="mt-2 wrap-break-word text-xs">
          <span className="font-medium">Interpretación:</span> {evidence.interpretation}
        </p>
      </div>
      {evidence.url ? (
        <ExternalLink className="no-print mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
    </div>
  );
}

function EvidenceItem({ evidence }: { evidence: GroupReportEvidence }) {
  const className = "block min-w-0 rounded-lg border border-border bg-background p-3";
  return evidence.url ? (
    <a
      href={evidence.url}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:bg-accent`}
    >
      <EvidenceContent evidence={evidence} />
    </a>
  ) : (
    <div className={className}>
      <EvidenceContent evidence={evidence} />
    </div>
  );
}

function EvidenceList({
  items,
  title = "Evidencia",
}: {
  items: GroupReportEvidence[];
  title?: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <div className="mt-2 grid min-w-0 gap-2">
        {items.map((evidence, index) => (
          <EvidenceItem
            key={`${evidence.resource}-${evidence.reference ?? evidence.title}-${index}`}
            evidence={evidence}
          />
        ))}
      </div>
    </div>
  );
}

function AssessmentDetails({ assessment }: { assessment: GroupReportAssessment }) {
  return (
    <div className="min-w-0">
      <p className="wrap-break-word text-sm text-muted-foreground">{assessment.summary}</p>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <ListBlock title="Señales positivas" items={assessment.positiveSignals} />
        <ListBlock title="Preocupaciones" items={assessment.concerns} />
      </div>
      <div className="mt-4">
        <ListBlock title="Limitaciones" items={assessment.limitations} />
      </div>
    </div>
  );
}

function DimensionCard({
  title,
  assessment,
}: {
  title: string;
  assessment: GroupReportDimensionAssessment;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h3 className="wrap-break-word text-sm font-semibold">{title}</h3>
        <Badge className={statusClasses(assessment.status)}>
          {statusLabels[assessment.status]}
        </Badge>
      </div>
      <p className="mt-3 wrap-break-word text-sm text-muted-foreground">{assessment.summary}</p>
    </Card>
  );
}

function AssessmentCard({
  title,
  assessment,
}: {
  title: string;
  assessment: GroupReportAssessment;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h3 className="wrap-break-wordword text-sm font-semibold">{title}</h3>
        <AssessmentBadges assessment={assessment} />
      </div>
      <div className="mt-3">
        <AssessmentDetails assessment={assessment} />
      </div>
    </Card>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function CommitContent({ commit }: { commit: CommitReview }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge className={statusClasses(commit.status)}>{statusLabels[commit.status]}</Badge>
          <Badge className={confidenceClasses(commit.confidence)}>
            {confidenceLabels[commit.confidence]}
          </Badge>
        </div>
        {commit.url ? <ExternalLink className="no-print h-4 w-4 text-muted-foreground" /> : null}
      </div>
      <h4 className="mt-3 wrap-break-word text-sm font-semibold">{commit.message}</h4>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {commit.resource}
        {commit.reference ? ` · ${commit.reference}` : ""}
        {commit.author ? ` · ${commit.author}` : ""}
      </p>
      <p className="mt-3 wrap-break-word text-sm text-muted-foreground">{commit.explanation}</p>
      <div className="mt-3">
        <ListBlock title="Señales observadas" items={commit.signals} />
      </div>
      <p className="mt-3 wrap-break-word text-xs font-medium">
        Acción recomendada: {commit.recommendedAction}
      </p>
    </div>
  );
}

function CommitCard({ commit }: { commit: CommitReview }) {
  const className = "block min-w-0 rounded-xl border border-border bg-background p-4";
  return commit.url ? (
    <a
      href={commit.url}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:bg-accent`}
    >
      <CommitContent commit={commit} />
    </a>
  ) : (
    <div className={className}>
      <CommitContent commit={commit} />
    </div>
  );
}

const effortLabels = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" } as const;
const personalityLabels = {
  demanding: "Exigente",
  direct: "Directo",
  careful: "Cuidadoso",
} as const;

function pdfFileName(title: string) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (cleaned) return cleaned;
  const day = new Date().toLocaleDateString("en-CA");
  return `Report ${day}`;
}

export function GroupReportRenderer({ report, onBack, onDelete, canDelete, onRename }: Props) {
  const data = report.data;
  const overall = data.overallAssessment;
  const evidenceForSection = (section: GroupReportEvidence["section"]) =>
    data.evidence.filter((evidence) => evidence.section === section);
  const evidenceForPerson = (displayName: string) =>
    data.evidence.filter(
      (evidence) => evidence.section === "PEOPLE" && evidence.subject === displayName,
    );
  const unassignedPeopleEvidence = data.evidence.filter(
    (evidence) =>
      evidence.section === "PEOPLE" &&
      !data.people.some((person) => person.displayName === evidence.subject),
  );
  const generatedAt = report.createdAt ? new Date(report.createdAt).toLocaleString("es-AR") : "";
  const savedTitle = report.title ?? "";
  const [name, setName] = useState(savedTitle);

  useEffect(() => {
    setName(savedTitle);
  }, [report.id, savedTitle]);

  function commitName() {
    const next = name.trim();
    if (next === savedTitle.trim()) return;
    onRename?.(next ? next : null);
  }

  function downloadPdf() {
    const source = document.getElementById("group-report");
    if (!source) return;
    const previousTitle = document.title;
    document.title = pdfFileName(name);

    const host = document.createElement("div");
    host.id = "print-root";
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    const input = clone.querySelector("input");
    const title = name.trim();
    if (input) {
      if (title) {
        const heading = document.createElement("h2");
        heading.className = "min-w-0 text-xl font-semibold";
        heading.textContent = title;
        input.replaceWith(heading);
      } else {
        input.remove();
      }
    }
    clone.querySelectorAll(".no-print").forEach((node) => node.remove());
    host.appendChild(clone);
    document.body.appendChild(host);
    document.body.classList.add("printing-report");

    const cleanup = () => {
      document.body.classList.remove("printing-report");
      host.remove();
      document.title = previousTitle;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <div id="group-report" className="min-w-0 space-y-8 overflow-hidden">
      <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex min-w-0 items-center gap-1">
              {onBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="no-print -ml-2 shrink-0"
                  aria-label="Back"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {onRename ? (
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  placeholder="Report name"
                  aria-label="Report name"
                  maxLength={120}
                  className="min-w-0 flex-1 border-transparent bg-transparent text-xl font-semibold shadow-none placeholder:font-normal hover:border-input"
                />
              ) : (
                <h2 className="min-w-0 wrap-break-word text-xl font-semibold">
                  {savedTitle || "Report"}
                </h2>
              )}
            </div>
            {data.evaluator && (
              <p className="mt-1 text-sm text-muted-foreground">
                Evaluador usado{" "}
                <span className="font-medium text-foreground">{data.evaluator.name}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-xs text-muted-foreground">Generado {generatedAt}</div>
              {canDelete && onDelete && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="no-print hover:bg-red-600 hover:text-white"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="no-print"
                onClick={downloadPdf}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Download PDF
              </Button>
            </div>
            {data.evaluator && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {data.evaluator.scope === "WORKSPACE" ? "Workspace" : "Proyecto"}
                </span>
                <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Esfuerzo {effortLabels[data.evaluator.effort]}
                </span>
                {data.evaluator.personality && (
                  <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {personalityLabels[data.evaluator.personality]}
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 wrap-break-word text-sm text-muted-foreground">{data.summary}</p>
            <div className="mt-3">
              <AssessmentBadges assessment={overall} />
            </div>
          </div>
          <div className="w-full shrink-0 rounded-xl border border-border bg-background p-4 text-center sm:w-auto sm:min-w-32">
            <div className="text-3xl font-semibold">{overall.score ?? "—"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Evaluación general</div>
          </div>
        </div>
        <div className="mt-4">
          <AssessmentDetails assessment={overall} />
        </div>
        <div className="mt-4">
          <EvidenceList items={evidenceForSection("OVERALL")} />
        </div>
      </Card>

      {(data.questionAnswers ?? []).length > 0 && (
        <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preguntas
          </p>
          <div className="mt-3 space-y-4">
            {data.questionAnswers?.map((item) => (
              <div key={item.question}>
                <p className="text-sm font-medium">{item.question}</p>
                <p className="mt-1 wrap-break-word text-sm text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.evaluationGuidelines &&
        (data.evaluationGuidelines.emphasis.length > 0 || data.evaluationGuidelines.notes) && (
          <Card className="min-w-0 overflow-hidden rounded-xl border-border/60 p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Criterios de evaluación usados
            </p>
            {data.evaluationGuidelines.emphasis.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.evaluationGuidelines.emphasis.map((e) => (
                  <span
                    key={e}
                    className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {EMPHASIS_LABELS[e as EvaluationEmphasis] ?? e}
                  </span>
                ))}
              </div>
            )}
            {data.evaluationGuidelines.notes && (
              <p className="mt-2 wrap-break-word text-xs text-muted-foreground">
                {data.evaluationGuidelines.notes}
              </p>
            )}
          </Card>
        )}

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <Metric label="Recursos" value={data.coverage.resourcesAnalyzed} />
        <Metric label="Datasets" value={data.coverage.datasetsAnalyzed} />
        <Metric label="Registros" value={data.coverage.recordsAnalyzed} />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            title="Producto e ideación"
            description="Problemas abordados, prioridades, alcance y evolución inferible desde tickets."
          />
          <Badge className="border-border bg-muted text-muted-foreground">
            {data.productAssessment.ticketEvidenceAvailable
              ? "Con evidencia de tickets"
              : "Sin evidencia de tickets"}
          </Badge>
        </div>
        <AssessmentCard
          title="Evaluación del producto"
          assessment={data.productAssessment.assessment}
        />
        <div className="grid min-w-0 gap-3 xl:grid-cols-3">
          <DimensionCard title="Ideación" assessment={data.productAssessment.ideation} />
          <DimensionCard
            title="Prioridades y alcance"
            assessment={data.productAssessment.prioritiesAndScope}
          />
          <DimensionCard title="Flujo de tickets" assessment={data.productAssessment.ticketFlow} />
        </div>
        {data.productAssessment.themes.length ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Temas del producto</h3>
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              {data.productAssessment.themes.map((theme, index) => (
                <Card
                  key={`${theme.name}-${index}`}
                  className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card"
                >
                  <h4 className="wrap-break-word text-sm font-semibold">{theme.name}</h4>
                  <p className="mt-2 wrap-break-word text-sm text-muted-foreground">
                    {theme.evolution}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
        <ListBlock title="Vacíos observados" items={data.productAssessment.gaps} />
        <EvidenceList items={evidenceForSection("PRODUCT")} />
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Ejecución del proyecto"
          description="Continuidad, entrega, previsibilidad, riesgos y aprendizaje durante el historial disponible."
        />
        <AssessmentCard
          title="Evaluación del proyecto"
          assessment={data.projectAssessment.assessment}
        />
        <div className="grid min-w-0 gap-3 xl:grid-cols-3">
          <DimensionCard
            title="Flujo de entrega"
            assessment={data.projectAssessment.deliveryFlow}
          />
          <DimensionCard title="Continuidad" assessment={data.projectAssessment.continuity} />
          <DimensionCard
            title="Previsibilidad"
            assessment={data.projectAssessment.predictability}
          />
        </div>
        {data.projectAssessment.projectStages.length ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Etapas del proyecto</h3>
            <div className="grid min-w-0 gap-3">
              {data.projectAssessment.projectStages.map((stage, index) => (
                <Card
                  key={`${stage.label}-${stage.period}-${index}`}
                  className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="wrap-break-words text-sm font-semibold">{stage.label}</h4>
                    <Badge className="border-border bg-muted text-muted-foreground">
                      {stage.period}
                    </Badge>
                    <Badge className={statusClasses(stage.status)}>
                      {statusLabels[stage.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 wrap-break-words text-sm text-muted-foreground">
                    {stage.summary}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <ListBlock title="Riesgos del proyecto" items={data.projectAssessment.risks} />
          <ListBlock title="Aprendizajes" items={data.projectAssessment.lessons} />
        </div>
        <EvidenceList items={evidenceForSection("PROJECT")} />
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Ingeniería y programación"
          description="Trazabilidad, disciplina de cambios, revisabilidad y mantenimiento según los metadatos disponibles."
        />
        <AssessmentCard
          title="Evaluación de ingeniería"
          assessment={data.engineeringAssessment.assessment}
        />
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <DimensionCard
            title="Trazabilidad"
            assessment={data.engineeringAssessment.traceability}
          />
          <DimensionCard
            title="Disciplina de cambios"
            assessment={data.engineeringAssessment.changeDiscipline}
          />
          <DimensionCard
            title="Revisabilidad"
            assessment={data.engineeringAssessment.reviewability}
          />
          <DimensionCard
            title="Señales de mantenimiento"
            assessment={data.engineeringAssessment.maintenanceSignals}
          />
        </div>
        <EvidenceList items={evidenceForSection("ENGINEERING")} />
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Commits para revisar</h3>
          {data.engineeringAssessment.commitsToReview.length ? (
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              {data.engineeringAssessment.commitsToReview.map((commit, index) => (
                <CommitCard
                  key={`${commit.resource}-${commit.reference ?? commit.message}-${index}`}
                  commit={commit}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se identificaron commits que requieran revisión con la evidencia disponible.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Personas"
          description="Evaluaciones independientes basadas en contribuciones observables, constancia y contexto."
        />
        <div className="grid min-w-0 gap-4">
          {data.people.map((person, personIndex) => (
            <Card
              key={`${person.displayName}-${personIndex}`}
              className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="wrap-break-words text-base font-semibold">{person.displayName}</h3>
                  <p className="mt-2 wrap-break-words text-sm text-muted-foreground">
                    {person.contributionSummary}
                  </p>
                </div>
                <AssessmentBadges assessment={person.assessment} />
              </div>

              {person.metrics.length ? (
                <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {person.metrics.map((metric, index) => (
                    <Metric
                      key={`${metric.label}-${index}`}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">Constancia</h4>
                  <Badge className="border-border bg-muted text-muted-foreground">
                    {consistencyLabels[person.consistency.level]}
                  </Badge>
                  <Badge className={confidenceClasses(person.consistency.confidence)}>
                    {confidenceLabels[person.consistency.confidence]}
                  </Badge>
                </div>
                <p className="mt-2 wrap-break-words text-sm text-muted-foreground">
                  {person.consistency.summary}
                </p>
                <div className="mt-4">
                  <ListBlock title="Limitaciones" items={person.consistency.limitations} />
                </div>
              </div>

              <div className="mt-4">
                <AssessmentDetails assessment={person.assessment} />
              </div>
              <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                <ListBlock title="Áreas de mejora" items={person.improvementAreas} />
                <ListBlock title="Sugerencias" items={person.suggestions} />
              </div>
              <div className="mt-4">
                <EvidenceList
                  items={evidenceForPerson(person.displayName)}
                  title="Evidencia y trabajo relevante"
                />
              </div>
            </Card>
          ))}
        </div>
        <EvidenceList
          items={unassignedPeopleEvidence}
          title="Evidencia de personas sin asociación exacta"
        />
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Recomendaciones"
          description="Acciones priorizadas a partir de la evaluación completa."
        />
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {data.recommendations.map((recommendation, index) => (
            <Card
              key={`${recommendation.title}-${index}`}
              className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card"
            >
              <Badge className={priorityClasses(recommendation.priority)}>
                Prioridad {priorityLabel(recommendation.priority)}
              </Badge>
              <h4 className="mt-3 wrap-break-words text-sm font-semibold">
                {recommendation.title}
              </h4>
              <p className="mt-1 wrap-break-words text-sm text-muted-foreground">
                {recommendation.description}
              </p>
              <p className="mt-2 wrap-break-words text-xs font-medium">{recommendation.action}</p>
            </Card>
          ))}
        </div>
      </section>

      <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card">
        <h3 className="text-sm font-semibold">Cobertura</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.coverage.firstActivityAt ?? "Inicio desconocido"} –{" "}
          {data.coverage.lastActivityAt ?? "Fin desconocido"}
        </p>
        <div className="mt-4">
          <ListBlock title="Limitaciones" items={data.coverage.limitations} />
        </div>
      </Card>
    </div>
  );
}
