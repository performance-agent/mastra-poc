import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ReportLength } from "@/lib/types";

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
  const reports = useQuery({
    queryKey: ["group", groupId, "reports"],
    queryFn: () => api.listGroupReports(groupId),
  });
  const models = useQuery({
    queryKey: ["workspace", workspaceId, "evaluation-models"],
    queryFn: () => api.listEvaluationModels(workspaceId),
  });
  return (
    <fieldset disabled={isRunning} className="space-y-4 border-b p-5 sm:p-7">
      <legend className="px-2 font-semibold">Reportes para analizar evolución</legend>
      <p className="text-sm text-muted-foreground">
        Seleccioná snapshots del mismo equipo. Su historial puede superponerse; las fechas de
        generación no delimitan sprints.
      </p>
      {reports.isPending ? <p>Cargando reportes…</p> : null}
      {reports.isError ? <p role="alert">{errorMessage(reports.error)}</p> : null}
      {reports.isSuccess && !reports.data.some((r) => r.type === "GROUP_REPORT") ? (
        <p>Generá primero un reporte del grupo.</p>
      ) : null}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {reports.data
          ?.filter((r) => r.type === "GROUP_REPORT")
          .map((r) => (
            <label key={r.id} className="flex gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={sourceReportIds.includes(r.id)}
                onChange={(e) =>
                  setSourceReportIds((current) =>
                    e.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id),
                  )
                }
              />
              <span>{r.createdAt ? new Date(r.createdAt).toLocaleString() : r.id}</span>
            </label>
          ))}
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
