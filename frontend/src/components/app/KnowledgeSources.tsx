import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Folder, Info, Link2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  knowledgeApi,
  knowledgeDescendants,
  usageLabel,
  type KnowledgeNode,
  type KnowledgeReportSnapshot,
} from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchInput } from "./SearchInput";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

export function KnowledgeStatus({ node }: { node: Pick<KnowledgeNode, "status" | "error"> }) {
  return (
    <StatusBadge
      title={node.error ?? undefined}
      variant={
        node.status === "READY"
          ? "success"
          : node.status === "PROCESSING"
            ? "neutral"
            : node.status === "ERROR"
              ? "danger"
              : "warning"
      }
    >
      {node.status === "READY"
        ? "Ready"
        : node.status === "PROCESSING"
          ? "Processing"
          : node.status === "UNAVAILABLE"
            ? "Access unavailable"
            : "Needs attention"}
    </StatusBadge>
  );
}
export function KnowledgeUse({ usage }: { usage: KnowledgeNode["usage"] }) {
  return (
    <StatusBadge>
      <span className="inline-flex items-center gap-1">
        <BookOpen className="h-3 w-3" />
        {usageLabel(usage)}
      </span>
    </StatusBadge>
  );
}

export function KnowledgeSourcePicker({
  groupId,
  workspaceId,
  onChange,
}: {
  groupId: string;
  workspaceId?: string;
  onChange: (sourceIds: string[] | null) => void;
}) {
  const { firebaseUser } = useAuth();
  const group = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.getGroup(groupId),
    enabled: !workspaceId,
  });
  const targetWorkspace = workspaceId ?? group.data?.workspaceId;
  const library = useQuery({
    queryKey: ["knowledge", targetWorkspace, groupId, firebaseUser?.uid],
    queryFn: () => knowledgeApi.list({ workspaceId: targetWorkspace!, groupId }),
    enabled: Boolean(targetWorkspace),
    refetchInterval: 5000,
  });
  const nodes = library.data?.nodes ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const seeded = useRef(false);
  const ready = nodes.filter(
    (n) => n.kind === "DOCUMENT" && n.status === "READY" && n.version && !n.excluded,
  );
  const update = (next: Set<string>) => {
    setSelected(next);
    onChange([...next]);
  };
  useEffect(() => {
    if (!library.data) return;
    const ids = new Set(
      library.data.nodes
        .filter((n) => n.kind === "DOCUMENT" && n.status === "READY" && n.version && !n.excluded)
        .map((n) => n.id),
    );
    if (!seeded.current) {
      seeded.current = true;
      setSelected(ids);
      onChange([...ids]);
    }
  }, [library.data, onChange]);
  if ((!workspaceId && group.isLoading) || library.isLoading) return <LoadingState />;
  if ((!workspaceId && group.error) || library.error)
    return (
      <ErrorState
        message={errorMessage(library.error ?? group.error)}
        onRetry={() => {
          if (!workspaceId) void group.refetch();
          void library.refetch();
        }}
      />
    );
  const visible = nodes.filter((n) => !n.excluded);
  function renderGroup(parentId: string | null, depth = 0): React.ReactNode {
    if (depth > 64) return null;
    return visible
      .filter(
        (n) =>
          n.parentId === parentId ||
          (!parentId && n.parentId && !visible.some((p) => p.id === n.parentId)),
      )
      .map((node) => {
        const descendants = knowledgeDescendants(visible, [node.id]);
        const documents = ready.filter((n) => descendants.has(n.id));
        const matching = visible.filter(
          (n) =>
            descendants.has(n.id) &&
            n.kind === "DOCUMENT" &&
            n.name.toLowerCase().includes(search.toLowerCase()),
        );
        if (search && !matching.length && !node.name.toLowerCase().includes(search.toLowerCase()))
          return null;
        const count = documents.filter((n) => selected.has(n.id)).length;
        if (node.kind === "FOLDER")
          return (
            <section
              key={node.id}
              className={depth ? "ml-3 border-l-2 border-[var(--brand-soft)]" : ""}
            >
              <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-3 text-xs">
                <Checkbox
                  aria-label={`Select ${node.name}`}
                  checked={
                    count && count < documents.length
                      ? "indeterminate"
                      : documents.length > 0 && count === documents.length
                  }
                  disabled={!documents.length}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    documents.forEach((d) => {
                      if (checked === true) next.add(d.id);
                      else next.delete(d.id);
                    });
                    update(next);
                  }}
                />
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{node.name}</span>
                {node.connectionId && <Link2 className="h-3 w-3 text-muted-foreground" />}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {node.inherited ? "From workspace" : "Project"}
                </span>
              </div>
              {renderGroup(node.id, depth + 1)}
            </section>
          );
        const disabled = node.status !== "READY" || !node.version;
        return (
          <Label
            key={node.id}
            className={`flex items-center gap-3 border-b px-4 py-3 ${disabled ? "bg-muted/15 opacity-70" : ""}`}
          >
            <Checkbox
              aria-label={`Use ${node.name}`}
              checked={!disabled && selected.has(node.id)}
              disabled={disabled}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked === true) next.add(node.id);
                else next.delete(node.id);
                update(next);
              }}
            />
            <FileText className="h-4 w-4 shrink-0 text-[var(--brand)]" />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-xs font-medium">{node.name}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                {disabled
                  ? (node.error ?? "Preparing this document for reports…")
                  : `${node.origin === "GOOGLE_DRIVE" ? "Google Drive" : "Uploaded"} · ${node.inherited ? "From workspace" : "Project source"}`}
              </span>
            </span>
            <span className="hidden sm:block">
              <KnowledgeUse usage={node.usage} />
            </span>
            {disabled && <KnowledgeStatus node={node} />}
          </Label>
        );
      });
  }
  return (
    <div className="space-y-3" data-testid="knowledge-source-picker">
      <div>
        <h3 className="text-sm font-semibold">Knowledge sources</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          All ready sources are selected. Deselect any file or folder you do not want to include.
        </p>
      </div>
      {nodes.length > 0 && (
        <SearchInput
          ariaLabel="Find report source"
          placeholder="Find a source…"
          value={search}
          onChange={setSearch}
        />
      )}
      <Card className="overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center gap-3 border-b p-3 text-xs">
          <Checkbox
            aria-label="Select all ready sources"
            checked={
              selected.size && selected.size < ready.length
                ? "indeterminate"
                : ready.length > 0 && selected.size === ready.length
            }
            disabled={!ready.length}
            onCheckedChange={(checked) =>
              update(checked === true ? new Set(ready.map((n) => n.id)) : new Set())
            }
          />
          <span>{selected.size} documents selected</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-[11px]"
            onClick={() => update(new Set(ready.map((n) => n.id)))}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => update(new Set())}
          >
            Deselect all
          </Button>
        </div>
        {renderGroup(null)}
        {!visible.length && (
          <EmptyState
            title="No knowledge documents"
            description="No knowledge documents are available for this project yet."
            icon={<BookOpen className="h-5 w-5" />}
          />
        )}
      </Card>
      {selected.size === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No knowledge selected. This report will use the configured plugin resources only.
          </AlertDescription>
        </Alert>
      )}
      <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Context provides background and goals. Evidence can support findings. Documents marked Both
        are included once. Unavailable files cannot be selected.
      </p>
    </div>
  );
}

export function ReportKnowledgeSources({
  snapshot,
}: {
  snapshot: KnowledgeReportSnapshot | undefined;
}) {
  const [opened, setOpened] = useState<KnowledgeReportSnapshot["sources"][number] | null>(null);
  if (!snapshot) return null;
  return (
    <Card className="min-w-0 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[var(--brand)]" />
        <h3 className="text-sm font-semibold">Knowledge used</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {snapshot.sources.length} documents
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        References captured {new Date(snapshot.capturedAt).toLocaleString()}. Later source changes
        do not alter this report.
      </p>
      {snapshot.sources.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No knowledge documents were selected.</p>
      ) : (
        <div className="mt-3 divide-y">
          {snapshot.sources.map((source, index) => (
            <Button
              variant="ghost"
              key={source.versionId}
              onClick={() => setOpened(source)}
              className="h-auto w-full items-start justify-start gap-3 whitespace-normal py-3 text-left"
            >
              <StatusBadge>{index + 1}</StatusBadge>
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-xs">{source.name}</strong>
                <span className="mt-1 block break-all text-[10px] text-muted-foreground">
                  {source.scope === "workspace" ? "Workspace" : "Project"} ·{" "}
                  {source.origin === "GOOGLE_DRIVE" ? "Google Drive" : "Uploaded"} ·{" "}
                  {source.revision.length > 30
                    ? source.revision.slice(0, 16) + "…"
                    : source.revision}
                </span>
              </span>
              <KnowledgeUse usage={source.usage} />
            </Button>
          ))}
        </div>
      )}
      {snapshot.unavailable > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {snapshot.unavailable} unavailable sources were not included.
        </p>
      )}
      <Dialog
        open={Boolean(opened)}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{opened?.name}</DialogTitle>
            <DialogDescription>
              The exact excerpts provided to the model for this saved report.
            </DialogDescription>
          </DialogHeader>
          {opened && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <KnowledgeUse usage={opened.usage} />
                <span className="break-all text-[10px] text-muted-foreground">
                  Version: {opened.versionId}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {opened.includedCharacters} excerpt characters supplied out of{" "}
                {opened.totalCharacters}. Excerpts may overlap. Omitted text was not supplied.
              </p>
              {opened.excerpts.map((excerpt) => (
                <div key={excerpt.reference} className="rounded-lg border p-3">
                  <p className="break-all text-[10px] text-muted-foreground">{excerpt.reference}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {excerpt.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
