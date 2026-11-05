import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/app/Avatar";
import { GenerationProgressPanel } from "@/components/app/GenerationProgress";
import { GroupReportRenderer } from "@/components/app/GroupReportRenderer";
import { ReportPdfExportButton } from "@/components/app/ReportPdfExportButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useExperience } from "@/lib/experience-context";
import { quoteFromSelection, quoteLayout, type QuoteBox } from "@/lib/report-notes";
import type { GenerationJob, GroupReport, PerformanceReport, ReportNote } from "@/lib/types";

type Composer = { quote: string; x: number; y: number };

function sameTops(current: Record<string, number>, next: Record<string, number>) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return (
    currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key])
  );
}

function sameMarks(current: Record<string, QuoteBox[]>, next: Record<string, QuoteBox[]>) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) return false;
  return nextKeys.every((key) => {
    const left = current[key] ?? [];
    const right = next[key] ?? [];
    return (
      left.length === right.length &&
      right.every(
        (box, index) =>
          box.top === left[index]?.top &&
          box.left === left[index]?.left &&
          box.width === left[index]?.width &&
          box.height === left[index]?.height,
      )
    );
  });
}

function commentWhen(createdAt?: string) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("es-AR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const label =
    diff === 0
      ? "Hoy"
      : diff === 1
        ? "Ayer"
        : date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${time} ${label}`;
}

function versionLabel(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Versión";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportThread({
  groupId,
  report,
  groupName = "Project",
  canEdit,
  onBack,
  onDelete,
  onRename,
}: {
  groupId: string;
  report: PerformanceReport<GroupReport>;
  groupName?: string;
  canEdit: boolean;
  onBack?: () => void;
  onDelete?: () => void;
  onRename?: (title: string | null) => void;
}) {
  const qc = useQueryClient();
  const { firebaseUser } = useAuth();
  const experience = useExperience();
  const authorName =
    experience.profile?.name || firebaseUser?.displayName || firebaseUser?.email || "Usuario";
  const authorPhotoUrl = experience.profile?.photoUrl ?? firebaseUser?.photoURL ?? null;
  const revisionsQ = useQuery({
    queryKey: ["report", report.id, "revisions"],
    queryFn: () => api.listReportRevisions(report.id),
  });
  const revisions = revisionsQ.data ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const index =
    revisions.length === 0 ? 0 : Math.min(picked ?? revisions.length - 1, revisions.length - 1);
  const selected = revisions[index];
  const isLatest = revisions.length === 0 || index === revisions.length - 1;
  const [draft, setDraft] = useState<ReportNote[] | null>(null);
  const savedNotes = selected?.notes;
  const notes = useMemo(
    () => (isLatest ? (draft ?? savedNotes ?? []) : (savedNotes ?? [])),
    [draft, isLatest, savedNotes],
  );
  const [commentMode, setCommentMode] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [commentText, setCommentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [placed, setPlaced] = useState<Record<string, number>>({});
  const [marks, setMarks] = useState<Record<string, QuoteBox[]>>({});
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const columnRef = useRef<HTMLDivElement | null>(null);
  const marginRef = useRef<HTMLElement | null>(null);
  const handledJob = useRef<string | null>(null);

  const jobQ = useQuery({
    queryKey: ["group", groupId, "generation-job", jobId],
    queryFn: ({ signal }) => api.getGroupGenerationJob(groupId, jobId ?? "", signal),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 1000;
    },
  });
  const job = jobQ.data;
  const rewriting = Boolean(jobId) && job?.status !== "succeeded" && job?.status !== "failed";

  useEffect(() => {
    if (!jobId || !job || handledJob.current === jobId) return;
    if (job.status !== "succeeded" && job.status !== "failed") return;
    handledJob.current = jobId;
    if (job.status === "succeeded") {
      setPicked(null);
      setDraft(null);
      setCommentMode(false);
      setComposer(null);
      void qc.invalidateQueries({ queryKey: ["group", groupId, "reports"] });
      void qc.invalidateQueries({ queryKey: ["report", report.id, "revisions"] });
      toast.success("Nueva versión del reporte");
    } else {
      toast.error(job.error ?? "No se pudo reescribir el reporte");
    }
    setJobId(null);
  }, [groupId, job, jobId, qc, report.id]);

  useEffect(() => {
    if (!commentMode || !isLatest || rewriting) return;
    const onUp = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-note-composer]")) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const body = document.getElementById("group-report");
      if (!body) return;
      const quote = quoteFromSelection(body, range);
      if (!quote) return;
      if (quote.length > 500) {
        toast.error("Seleccioná un fragmento más corto");
        return;
      }
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      if (!body || !element || !body.contains(element)) return;
      if (element.closest(".no-print, button, input, textarea")) return;
      const rect = range.getBoundingClientRect();
      setCommentText("");
      setComposer({
        quote,
        x: Math.max(12, Math.min(rect.left, window.innerWidth - 340)),
        y: Math.min(rect.bottom + 8, window.innerHeight - 220),
      });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [commentMode, isLatest, rewriting]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    const root = document.getElementById("group-report");
    const column = columnRef.current;
    if (!root || !column) return;
    const measure = () => {
      const margin = marginRef.current;
      const cards = margin ? Array.from(margin.querySelectorAll("article")) : [];
      const nextMarks: Record<string, QuoteBox[]> = {};
      const nextPlaced: Record<string, number> = {};
      const measured = notes.map((note, noteIndex) => {
        const layout = quoteLayout(root, note.quote, { column, margin });
        nextMarks[note.id] = layout.column;
        const anchor = layout.marginTop ?? layout.column[0]?.top;
        return {
          id: note.id,
          anchor: anchor == null ? Number.POSITIVE_INFINITY : anchor,
          height: cards[noteIndex]?.getBoundingClientRect().height ?? 96,
        };
      });
      let cursor = 0;
      const byText = [...measured].sort((left, right) => left.anchor - right.anchor);
      for (const item of byText) {
        const preferred = Number.isFinite(item.anchor) ? item.anchor : cursor;
        const top = Math.max(0, preferred, cursor);
        nextPlaced[item.id] = top;
        cursor = top + Math.max(item.height, 72) + 12;
      }
      setMarks((current) => (sameMarks(current, nextMarks) ? current : nextMarks));
      setPlaced((current) => (sameTops(current, nextPlaced) ? current : nextPlaced));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [notes, selected?.id, report.data, index, wide, editingId]);

  const displayed: PerformanceReport<GroupReport> = selected
    ? {
        ...report,
        data: selected.data as GroupReport,
        createdAt: selected.createdAt,
      }
    : report;

  async function persistNotes(next: ReportNote[]) {
    setDraft(next);
    setSaving(true);
    try {
      await api.saveReportNotes(report.id, next);
      await qc.invalidateQueries({ queryKey: ["report", report.id, "revisions"] });
    } catch (error) {
      setDraft(selected?.notes ?? []);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    const comment = commentText.trim();
    if (!composer || !comment || saving) return;
    if (notes.length >= 30) {
      toast.error("Este reporte ya tiene 30 notas");
      return;
    }
    const next = [
      ...notes,
      {
        id: crypto.randomUUID(),
        quote: composer.quote,
        comment,
        authorName,
        ...(authorPhotoUrl ? { authorPhotoUrl } : {}),
        createdAt: new Date().toISOString(),
      },
    ];
    setComposer(null);
    setCommentText("");
    window.getSelection()?.removeAllRanges();
    await persistNotes(next);
  }

  async function rewrite() {
    if (!canEdit || notes.length === 0 || rewriting || saving) return;
    try {
      const started = await api.reviseReport(report.id, notes);
      handledJob.current = null;
      setJobId(started.jobId);
      setCommentMode(false);
      setComposer(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const progressJob: GenerationJob<unknown> | null = job
    ? {
        id: job.id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
      }
    : jobId
      ? { id: jobId, status: "queued", progress: null, result: null, error: null }
      : null;

  return (
    <div className="min-w-0 space-y-4">
      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ReportPdfExportButton report={displayed} groupName={groupName} />
          {revisions.length > 0 && (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {revisions.map((revision, revisionIndex) => (
                <div key={revision.id} className="flex items-center">
                  {revisionIndex > 0 && <span className="mx-1 h-px w-5 bg-border" />}
                  <button
                    type="button"
                    aria-current={revisionIndex === index ? "true" : undefined}
                    title={versionLabel(revision.createdAt)}
                    onClick={() => {
                      setPicked(revisionIndex);
                      setComposer(null);
                      if (revisionIndex !== revisions.length - 1) setCommentMode(false);
                    }}
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-medium ${
                      revisionIndex === index
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {revisionIndex + 1}
                  </button>
                </div>
              ))}
              <span className="truncate pl-2 text-xs text-muted-foreground">
                Versión {index + 1} de {Math.max(revisions.length, 1)}
                {isLatest ? " · actual" : ""}
                {selected ? ` · ${versionLabel(selected.createdAt)}` : ""}
              </span>
            </div>
          )}
          {canEdit && isLatest && notes.length > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={rewriting || saving}
              onClick={() => void rewrite()}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {rewriting ? "Generando..." : "Generar versión con estos comentarios"}
            </Button>
          )}
          {canEdit && isLatest && (
            <Button
              type="button"
              size="sm"
              variant={commentMode ? "default" : "outline"}
              disabled={rewriting}
              onClick={() => {
                setCommentMode((current) => !current);
                setComposer(null);
              }}
            >
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              {commentMode ? "Comentando" : "Comentar"}
            </Button>
          )}
        </div>
        {commentMode && isLatest && (
          <p className="text-xs text-muted-foreground">
            Seleccioná un fragmento, escribí el comentario y guardalo. El subrayado queda en el
            reporte y el comentario aparece a la derecha.
          </p>
        )}
        {progressJob && rewriting && <GenerationProgressPanel report job={progressJob} />}
      </div>
      <div className={wide ? "flex items-start gap-4" : "space-y-4"}>
        <div ref={columnRef} className="relative min-w-0 flex-1">
          <GroupReportRenderer
            report={displayed}
            onBack={onBack}
            canDelete={canEdit}
            onDelete={onDelete}
            onRename={isLatest ? onRename : undefined}
          />
          <div className="pointer-events-none absolute inset-0 z-10">
            {notes.flatMap((note) =>
              (marks[note.id] ?? []).map((box, boxIndex) => (
                <span
                  key={`${note.id}-${boxIndex}`}
                  className="absolute rounded-sm"
                  style={{
                    top: box.top,
                    left: box.left,
                    width: box.width,
                    height: box.height,
                    backgroundColor:
                      hoveredId === note.id
                        ? "rgba(167, 139, 250, 0.55)"
                        : "rgba(139, 92, 246, 0.32)",
                    boxShadow: "inset 0 -2px 0 rgba(109, 40, 217, 0.95)",
                  }}
                />
              )),
            )}
          </div>
        </div>
        {notes.length > 0 && (
          <aside
            ref={marginRef}
            className={
              wide ? "no-print relative z-10 w-72 shrink-0" : "no-print w-full shrink-0 space-y-3"
            }
            aria-label="Comentarios"
          >
            {notes.map((note) => {
              const active = hoveredId === note.id;
              const editing = editingId === note.id;
              const name = note.authorName || authorName;
              const photo = note.authorPhotoUrl ?? (note.authorName ? null : authorPhotoUrl);
              const when = commentWhen(note.createdAt);
              return (
                <article
                  key={note.id}
                  className={`group relative rounded-2xl border border-border/70 bg-muted/40 p-3 ${
                    active ? "border-violet-300" : ""
                  } ${wide ? "absolute left-0 w-72" : ""}`}
                  style={wide ? { top: placed[note.id] ?? 0 } : undefined}
                  onMouseEnter={() => setHoveredId(note.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === note.id ? null : current))
                  }
                >
                  {canEdit && isLatest && !editing && (
                    <div
                      className={`absolute right-2 top-2 flex gap-0.5 ${
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label="Editar comentario"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                        onClick={() => {
                          setEditingId(note.id);
                          setEditText(note.comment);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar comentario"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                        onClick={() => {
                          if (editingId === note.id) setEditingId(null);
                          void persistNotes(notes.filter((item) => item.id !== note.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 pr-14">
                    <Avatar name={name} src={photo} className="h-8 w-8 rounded-full text-[11px]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground" title={name}>
                        {name}
                      </p>
                      {when && <p className="text-xs text-muted-foreground">{when}</p>}
                    </div>
                  </div>
                  {editing ? (
                    <div className="mt-2">
                      <Textarea
                        autoFocus
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        maxLength={2000}
                        className="min-h-16 bg-background"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!editText.trim() || saving}
                          onClick={() => {
                            const comment = editText.trim();
                            if (!comment) return;
                            setEditingId(null);
                            void persistNotes(
                              notes.map((item) =>
                                item.id === note.id ? { ...item, comment } : item,
                              ),
                            );
                          }}
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                      {note.comment}
                    </p>
                  )}
                </article>
              );
            })}
          </aside>
        )}
      </div>
      {composer && (
        <div
          data-note-composer
          className="fixed z-50 w-80 rounded-xl border border-border bg-background p-3 shadow-card"
          style={{ left: composer.x, top: composer.y }}
        >
          <p className="line-clamp-3 text-xs italic text-muted-foreground">“{composer.quote}”</p>
          <Textarea
            autoFocus
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Qué habría que cambiar"
            maxLength={2000}
            className="mt-2 min-h-20"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void addNote();
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setComposer(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!commentText.trim() || saving}
              onClick={() => void addNote()}
            >
              {saving ? "Guardando..." : "Guardar comentario"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
