import { useQuery } from "@tanstack/react-query";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { GroupReport, ReportLength } from "@/lib/types";

export function ReportAnalysisSources({
  workspaceId,
  groupId,
  sourceReportIds,
  setSourceReportIds,
  reportLength,
  setReportLength,
  modelKey,
  setModelKey,
  isRunning,
}: {
  workspaceId: string;
  groupId: string;
  sourceReportIds: string[];
  setSourceReportIds: Dispatch<SetStateAction<string[]>>;
  reportLength: ReportLength;
  setReportLength: (value: ReportLength) => void;
  modelKey: string;
  setModelKey: (value: string) => void;
  isRunning: boolean;
}) {
  const [search, setSearch] = useState("");
  const reports = useQuery({
    queryKey: ["group", groupId, "reports"],
    queryFn: () => api.listGroupReports(groupId),
  });
  const models = useQuery({
    queryKey: ["workspace", workspaceId, "evaluation-models"],
    queryFn: () => api.listEvaluationModels(workspaceId),
  });
  const available = (reports.data ?? [])
    .filter((report) => report.type === "GROUP_REPORT")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const query = search.trim().toLocaleLowerCase();
  const visible = available.filter((report) => {
    const period = (report.data as Partial<GroupReport>).period;
    return [
      report.title,
      report.id,
      report.createdAt,
      report.createdAt ? new Date(report.createdAt).toLocaleString("es-AR") : "",
      period?.from,
      period?.to,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
  return (
    <fieldset disabled={isRunning} className="min-w-0 space-y-4">
      <legend className="mb-2 font-semibold">Reportes para analizar evolución</legend>
      <p className="text-sm text-muted-foreground">
        Los reportes seleccionados son la evidencia principal. Se comparan del más antiguo al más
        reciente. Sus historiales pueden superponerse: la fecha de generación no define el período
        de trabajo.
      </p>
      <label className="block space-y-2 text-sm font-medium">
        <span>Buscar por nombre, fecha, año o identificador</span>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Por ejemplo: ATTENTI, 2026 o 2026-09"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status">{sourceReportIds.length} reportes seleccionados</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!visible.length}
            onClick={() =>
              setSourceReportIds((current) => [
                ...new Set([...current, ...visible.map((report) => report.id)]),
              ])
            }
          >
            Seleccionar visibles
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!sourceReportIds.length}
            onClick={() => setSourceReportIds([])}
          >
            Limpiar selección
          </Button>
        </div>
      </div>
      {reports.isPending ? <p>Cargando reportes…</p> : null}
      {reports.isError ? (
        <div role="alert">
          <p>{errorMessage(reports.error)}</p>
          <Button type="button" variant="outline" onClick={() => void reports.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {reports.isSuccess && !available.length ? (
        <p>Generá primero un reporte de este proyecto en Reports.</p>
      ) : null}
      {available.length > 0 && !visible.length ? (
        <p>No hay reportes que coincidan con la búsqueda.</p>
      ) : null}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {visible.map((report) => {
          const data = report.data as Partial<GroupReport>;
          return (
            <article
              key={report.id}
              className="rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={sourceReportIds.includes(report.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSourceReportIds((current) =>
                      checked
                        ? [...new Set([...current, report.id])]
                        : current.filter((id) => id !== report.id),
                    );
                  }}
                />
                <span className="min-w-0 space-y-1">
                  <span className="block break-words font-semibold">
                    {report.title?.trim() || report.id}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Generado:{" "}
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString("es-AR")
                      : "Fecha no disponible"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {data.period
                      ? `Período informado: ${data.period.from} – ${data.period.to}`
                      : "El reporte no informa un período de trabajo."}
                  </span>
                  <span className="block break-all font-mono text-[10px] text-muted-foreground">
                    ID: {report.id}
                  </span>
                </span>
              </label>
              {typeof data.summary === "string" && data.summary ? (
                <details className="mt-2 pl-6 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Ver resumen</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words">{data.summary}</p>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
      {sourceReportIds.length === 1 ? (
        <p className="text-sm">
          Un solo reporte permite un diagnóstico; seleccioná dos o más para comparar evolución.
        </p>
      ) : null}
      <label className="block">
        Extensión
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          value={reportLength}
          onChange={(e) => setReportLength(e.target.value as ReportLength)}
        >
          <option value="brief">Breve</option>
          <option value="medium">Media</option>
          <option value="complete">Completa</option>
        </select>
      </label>
      <label className="block">
        Modelo
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          value={modelKey}
          onChange={(e) => setModelKey(e.target.value)}
        >
          {models.data?.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {models.isError ? <p role="alert">{errorMessage(models.error)}</p> : null}
    </fieldset>
  );
}
