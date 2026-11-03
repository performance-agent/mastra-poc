import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Info,
  Link2,
  MoreHorizontal,
  Plus,
  Plug,
  RefreshCw,
  Search,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import {
  downloadKnowledge,
  knowledgeApi,
  knowledgeDescendants,
  uploadKnowledge,
  usageLabel,
  type DriveConnection,
  type KnowledgeNode,
  type KnowledgeScope,
  type KnowledgeUsage,
} from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { KnowledgeStatus, KnowledgeUse } from "./KnowledgeSources";

const field = "h-10 w-full rounded-lg border border-input bg-card px-3 text-xs";
const DRIVE_FOLDER = "application/vnd.google-apps.folder";
type UploadRow = {
  file: File;
  state: "queued" | "uploading" | "processing" | "error";
  progress: number;
  error?: string;
};
function FileMark({ folder = false }: { folder?: boolean }) {
  const Icon = folder ? Folder : FileText;
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${folder ? "bg-amber-50 text-amber-700 dark:bg-amber-950" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
function UsageSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: KnowledgeUsage;
  onChange: (v: KnowledgeUsage) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Use in reports"
      className={field}
      value={value}
      onChange={(e) => onChange(e.target.value as KnowledgeUsage)}
      disabled={disabled}
    >
      {(["CONTEXT", "EVIDENCE", "BOTH"] as const).map((v) => (
        <option key={v} value={v}>
          {usageLabel(v)}
        </option>
      ))}
    </select>
  );
}
function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-[var(--brand)]/15 bg-[var(--brand-soft)] p-3 text-xs leading-relaxed text-[var(--brand-ink)]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function KnowledgeResources({
  workspaceId,
  groupId,
  organizationId,
  children,
  initialView,
  initialConnectionId,
  initialError,
  initialNodeId,
}: {
  workspaceId: string;
  groupId?: string;
  organizationId: string;
  children: ReactNode;
  initialView?: string;
  initialConnectionId?: string;
  initialError?: string;
  initialNodeId?: string;
}) {
  const scope: KnowledgeScope = { workspaceId, ...(groupId ? { groupId } : {}) };
  const qc = useQueryClient();
  const key = ["knowledge", workspaceId, groupId];
  const [category, setCategory] = useState<"knowledge" | "plugins">("knowledge");
  const [view, setView] = useState(initialView === "connections" ? "connections" : "library");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [modal, setModal] = useState<"upload" | "drive" | "folder" | null>(
    initialConnectionId ? "drive" : null,
  );
  const [editing, setEditing] = useState<KnowledgeNode | null>(null);
  const [folderName, setFolderName] = useState("");
  const [destination, setDestination] = useState("");
  const [usage, setUsage] = useState<KnowledgeUsage>("CONTEXT");
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(initialNodeId ?? null);
  const [detailUsage, setDetailUsage] = useState<KnowledgeUsage>("CONTEXT");
  const [removing, setRemoving] = useState<KnowledgeNode | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [driveId, setDriveId] = useState(initialConnectionId ?? "");
  const [drivePath, setDrivePath] = useState([{ id: "root", name: "My Drive" }]);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveQuery, setDriveQuery] = useState("");
  const [driveSelection, setDriveSelection] = useState<Set<string>>(new Set());
  const seededDrive = useRef<string | null>(null);
  const library = useQuery({
    queryKey: key,
    queryFn: () => knowledgeApi.list(scope),
    enabled: category === "knowledge",
    refetchInterval: 5000,
  });
  const connections = useQuery({
    queryKey: ["knowledge-connections", workspaceId, groupId],
    queryFn: () => knowledgeApi.connections(scope),
    enabled: category === "knowledge",
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["knowledge-node", detailId],
    queryFn: () => knowledgeApi.detail(detailId!),
    enabled: Boolean(detailId),
    refetchInterval: (query) => (query.state.data?.status === "PROCESSING" ? 3000 : false),
  });
  const nodes = library.data?.nodes ?? [];
  const canManage = library.data?.canManage ?? false;
  const folders = nodes.filter(
    (n) => n.kind === "FOLDER" && !n.connectionId && (n.groupId ?? null) === (groupId ?? null),
  );
  const current = nodes.find((n) => n.id === folderId);
  const driveAccounts = (connections.data?.connections ?? []).filter(
    (c) => (c.groupId ?? null) === (groupId ?? null),
  );
  const driveFiles = useInfiniteQuery({
    queryKey: ["drive-files", driveId, drivePath.at(-1)?.id, driveQuery],
    queryFn: ({ pageParam }) =>
      knowledgeApi.browse(driveId, drivePath.at(-1)!.id, pageParam, driveQuery || undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: modal === "drive" && Boolean(driveId),
  });
  const errorSeen = useRef("");
  useEffect(() => {
    if (initialError && errorSeen.current !== initialError) {
      errorSeen.current = initialError;
      toast.error(initialError);
    }
  }, [initialError]);
  useEffect(() => {
    const timer = setTimeout(() => setDriveQuery(driveSearch), 300);
    return () => clearTimeout(timer);
  }, [driveSearch]);
  useEffect(() => {
    if (detail.data) setDetailUsage(detail.data.usage);
  }, [detail.data]);
  useEffect(() => {
    const connection = connections.data?.connections.find((c) => c.id === driveId);
    if (connection && seededDrive.current !== driveId) {
      seededDrive.current = driveId;
      setDriveSelection(new Set(connection.rootIds));
      setUsage(connection.usage);
      setDestination(connection.destinationId ?? "");
    }
  }, [driveId, connections.data]);
  useEffect(() => {
    if (!uploading) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [uploading]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["knowledge"] });
    void qc.invalidateQueries({ queryKey: ["knowledge-node"] });
    void qc.invalidateQueries({ queryKey: ["knowledge-connections"] });
  };
  async function perform(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    try {
      await action();
      refresh();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  }
  function openUpload() {
    setUploads([]);
    setDestination(current && !current.connectionId && !current.inherited ? current.id : "");
    setUsage("CONTEXT");
    setModal("upload");
  }
  function openFolder(node?: KnowledgeNode) {
    setEditing(node ?? null);
    setFolderName(node?.name ?? "");
    setDestination(
      node?.parentId ?? (current && !current.connectionId && !current.inherited ? current.id : ""),
    );
    setModal("folder");
  }
  function openDrive(id?: string) {
    seededDrive.current = null;
    setDriveId(id ?? driveAccounts[0]?.id ?? "");
    setDrivePath([{ id: "root", name: "My Drive" }]);
    setDriveSearch("");
    setModal("drive");
  }
  async function authorize(connection?: DriveConnection) {
    const targetScope = connection
      ? {
          workspaceId: connection.workspaceId,
          ...(connection.groupId ? { groupId: connection.groupId } : {}),
        }
      : scope;
    setSaving(true);
    try {
      const result = await knowledgeApi.authorize(targetScope, connection?.id);
      window.location.assign(result.url);
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }
  async function uploadRows(only?: number) {
    setUploading(true);
    const indices = uploads
      .map((_, i) => i)
      .filter((i) =>
        only !== undefined
          ? i === only
          : uploads[i].state === "queued" || uploads[i].state === "error",
      );
    for (const index of indices) {
      const row = uploads[index];
      if (row.file.size > 20 * 1024 * 1024) {
        setUploads((rows) =>
          rows.map((r, i) =>
            i === index ? { ...r, state: "error", error: "Choose a file up to 20 MB" } : r,
          ),
        );
        continue;
      }
      setUploads((rows) =>
        rows.map((r, i) =>
          i === index ? { ...r, state: "uploading", progress: 0, error: undefined } : r,
        ),
      );
      try {
        await uploadKnowledge(scope, row.file, destination || undefined, usage, (progress) =>
          setUploads((rows) => rows.map((r, i) => (i === index ? { ...r, progress } : r))),
        );
        setUploads((rows) =>
          rows.map((r, i) => (i === index ? { ...r, state: "processing", progress: 100 } : r)),
        );
        refresh();
      } catch (error) {
        setUploads((rows) =>
          rows.map((r, i) =>
            i === index ? { ...r, state: "error", error: errorMessage(error) } : r,
          ),
        );
      }
    }
    setUploading(false);
  }
  function appendFiles(files: FileList | null) {
    if (files)
      setUploads((rows) => [
        ...rows,
        ...Array.from(files).map((file) => ({ file, state: "queued" as const, progress: 0 })),
      ]);
  }
  function closeModal(open: boolean) {
    if (open) return;
    if (uploading) {
      toast.info("Wait for the current uploads to finish.");
      return;
    }
    setModal(null);
  }
  const visible = nodes
    .filter((n) =>
      !search ? n.parentId === folderId : n.name.toLowerCase().includes(search.toLowerCase()),
    )
    .filter((n) => origin === "all" || n.origin === origin);
  const breadcrumbs: KnowledgeNode[] = [];
  let ancestor = current;
  const visited = new Set<string>();
  while (ancestor && !visited.has(ancestor.id)) {
    breadcrumbs.unshift(ancestor);
    visited.add(ancestor.id);
    ancestor = nodes.find((n) => n.id === ancestor!.parentId);
  }
  const moveForbidden = editing ? knowledgeDescendants(nodes, [editing.id]) : new Set<string>();
  const folderOptions = (exclude = false) => (
    <>
      <option value="">All sources</option>
      {folders
        .filter((f) => !exclude || !moveForbidden.has(f.id))
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
    </>
  );
  return (
    <div className="space-y-5" data-testid="knowledge-resources">
      <div className="inline-flex max-w-full rounded-xl bg-muted p-1">
        <button
          onClick={() => setCategory("knowledge")}
          aria-pressed={category === "knowledge"}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${category === "knowledge" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          <BookOpen className="h-4 w-4" />
          Knowledge base
        </button>
        <button
          onClick={() => setCategory("plugins")}
          aria-pressed={category === "plugins"}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${category === "plugins" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          <Plug className="h-4 w-4" />
          Plugin resources
        </button>
      </div>
      {category === "plugins" ? (
        children
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {view === "connections" ? "Connections" : "Knowledge base"}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {view === "connections"
                  ? "Manage the Google Drive accounts and folders that keep your knowledge current."
                  : groupId
                    ? "Project documents and shared workspace knowledge, ready for your next report."
                    : "Give every report the context it needs. Organize documents and keep Drive folders connected."}
              </p>
            </div>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    Add sources
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openUpload}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload files
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openDrive()}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect Google Drive
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openFolder()}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {groupId && view === "library" && (
            <Note>
              <strong className="block">Shared knowledge, in the right context</strong>Workspace
              sources are available automatically. Exclude those that do not apply to this project.
              Review selected sources before generating each report.
            </Note>
          )}
          {library.isLoading ? (
            <LoadingState />
          ) : library.error ? (
            <ErrorState message={errorMessage(library.error)} onRetry={() => library.refetch()} />
          ) : (
            <div className="grid gap-5 md:grid-cols-[205px_minmax(0,1fr)]">
              <aside className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
                <button
                  onClick={() => {
                    setView("library");
                    setFolderId(null);
                    setSearch("");
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs ${view === "library" && !folderId ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]" : "text-muted-foreground"}`}
                >
                  <BookOpen className="h-4 w-4" />
                  All sources
                  <span className="ml-auto hidden text-[10px] md:block">
                    {nodes.filter((n) => n.kind === "DOCUMENT").length}
                  </span>
                </button>
                {nodes
                  .filter((n) => n.kind === "FOLDER")
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setView("library");
                        setFolderId(n.id);
                        setSearch("");
                      }}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${folderId === n.id && view === "library" ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]" : "text-muted-foreground"} ${n.parentId ? "md:ml-3" : ""}`}
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap md:whitespace-normal">{n.name}</span>
                      {n.connectionId && <Link2 className="h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                <button
                  onClick={() => setView("connections")}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs md:mt-4 md:border-t ${view === "connections" ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]" : "text-muted-foreground"}`}
                >
                  <Link2 className="h-4 w-4" />
                  Connections
                </button>
                {canManage && (
                  <button
                    onClick={() => openFolder()}
                    className="hidden items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground md:flex"
                  >
                    <Plus className="h-4 w-4" />
                    New folder
                  </button>
                )}
                <p className="mt-5 hidden px-3 text-[11px] leading-relaxed text-muted-foreground md:block">
                  {groupId
                    ? "Shared workspace documents are referenced without making another copy."
                    : "Knowledge in this workspace is available to its projects automatically."}
                </p>
              </aside>
              <section className="min-w-0">
                {view === "connections" ? (
                  <div className="space-y-3">
                    {connections.isLoading ? (
                      <LoadingState />
                    ) : connections.error ? (
                      <ErrorState
                        message={errorMessage(connections.error)}
                        onRetry={() => connections.refetch()}
                      />
                    ) : (
                      <>
                        {!connections.data?.configured && (
                          <Note>
                            Google Drive is not configured yet. Your administrator can enable the
                            connection. Direct file uploads are available independently.
                          </Note>
                        )}
                        {!connections.data?.connections.length && (
                          <Card className="p-8 text-center">
                            <Link2 className="mx-auto mb-3 h-7 w-7 text-[var(--brand)]" />
                            <h3 className="font-medium">Keep your knowledge connected</h3>
                            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                              Connect a Google account, choose files or folders and keep them
                              synchronized automatically.
                            </p>
                            {canManage && (
                              <Button
                                className="mt-5"
                                size="sm"
                                disabled={!connections.data?.configured || saving}
                                onClick={() => authorize()}
                              >
                                Connect Google Drive
                              </Button>
                            )}
                          </Card>
                        )}
                        {connections.data?.connections.map((connection) => {
                          const inherited = Boolean(groupId && !connection.groupId);
                          return (
                            <Card key={connection.id} className="p-5">
                              <div className="flex flex-wrap items-start gap-3">
                                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-soft)]">
                                  <Link2 className="h-4 w-4 text-[var(--brand)]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h3 className="break-all text-sm font-semibold">
                                    {connection.email}
                                  </h3>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Google Drive ·{" "}
                                    {inherited
                                      ? "From workspace"
                                      : groupId
                                        ? "Project"
                                        : "Workspace"}
                                  </p>
                                </div>
                                <KnowledgeStatus
                                  node={{
                                    status:
                                      connection.status === "CONNECTED"
                                        ? "READY"
                                        : connection.status === "RECONNECT"
                                          ? "UNAVAILABLE"
                                          : "ERROR",
                                    error: connection.error,
                                  }}
                                />
                              </div>
                              {connection.error && (
                                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                  {connection.error}
                                </p>
                              )}
                              <div className="my-4 flex flex-wrap gap-6 border-y py-3 text-[11px] text-muted-foreground">
                                <span>
                                  Connected items
                                  <strong className="mt-1 block font-medium text-foreground">
                                    {connection.rootIds.length}
                                  </strong>
                                </span>
                                <span>
                                  Synchronization
                                  <strong className="mt-1 block font-medium text-foreground">
                                    Automatic · Includes subfolders
                                  </strong>
                                </span>
                                <span>
                                  Last synchronized
                                  <strong className="mt-1 block font-medium text-foreground">
                                    {connection.lastSyncedAt
                                      ? new Date(connection.lastSyncedAt).toLocaleString()
                                      : "Not yet synchronized"}
                                  </strong>
                                </span>
                              </div>
                              {inherited ? (
                                <Link
                                  to="/organizations/$organizationId/workspaces/$workspaceId"
                                  params={{ organizationId, workspaceId }}
                                  search={{ tab: "resources", knowledgeView: "connections" }}
                                  className="text-xs text-[var(--brand-ink)]"
                                >
                                  Manage in workspace →
                                </Link>
                              ) : (
                                canManage && (
                                  <div className="flex flex-wrap gap-2">
                                    {connection.status === "RECONNECT" ? (
                                      <Button
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => authorize(connection)}
                                      >
                                        Reconnect account
                                      </Button>
                                    ) : (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={saving}
                                          onClick={() =>
                                            perform(
                                              () => knowledgeApi.sync(connection.id),
                                              "Synchronization queued",
                                            )
                                          }
                                        >
                                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                          Sync now
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openDrive(connection.id)}
                                        >
                                          Manage sources
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={saving}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            "Disconnect this account and remove its sources from this knowledge base? Saved report references will remain.",
                                          )
                                        )
                                          void perform(
                                            () => knowledgeApi.disconnect(connection.id),
                                            "Drive disconnected",
                                          );
                                      }}
                                    >
                                      Disconnect
                                    </Button>
                                  </div>
                                )
                              )}
                            </Card>
                          );
                        })}
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                          aria-label="Search knowledge sources"
                          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                          placeholder="Search files and folders…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter sources by origin"
                        className="h-10 max-w-40 rounded-lg border bg-card px-2 text-xs"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                      >
                        <option value="all">All origins</option>
                        <option value="UPLOAD">Uploaded / platform</option>
                        <option value="GOOGLE_DRIVE">Google Drive</option>
                      </select>
                    </div>
                    <Card className="overflow-hidden rounded-2xl">
                      <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-4 text-xs">
                        <button
                          onClick={() => {
                            setFolderId(null);
                            setSearch("");
                          }}
                          className="flex items-center gap-2"
                        >
                          <BookOpen className="h-4 w-4" />
                          All sources
                        </button>
                        {breadcrumbs.map((n) => (
                          <span key={n.id} className="flex items-center gap-1">
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            <button onClick={() => setFolderId(n.id)} className="font-medium">
                              {n.name}
                            </button>
                          </span>
                        ))}
                      </div>
                      {nodes.length === 0 ? (
                        <div className="p-8 text-center sm:p-14">
                          <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                            <BookOpen className="h-7 w-7" />
                          </span>
                          <h3 className="text-lg font-semibold">
                            A little context goes a long way
                          </h3>
                          <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
                            Add project briefs, reference material or deliverables. Your teams can
                            use them as context and evidence in their reports.
                          </p>
                          {canManage && (
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                              <Button size="sm" onClick={openUpload}>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload files
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openDrive()}>
                                Connect Google Drive
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b bg-muted/20 text-[10px] text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="hidden px-3 py-3 font-medium lg:table-cell">
                                  Origin
                                </th>
                                <th className="hidden px-3 py-3 font-medium sm:table-cell">
                                  Report use
                                </th>
                                <th className="px-2 py-3 font-medium">Status</th>
                                <th className="pr-3">
                                  <span className="sr-only">Actions</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {visible.map((node) => (
                                <tr
                                  key={node.id}
                                  className={node.excluded ? "opacity-55" : "hover:bg-muted/15"}
                                >
                                  <td className="max-w-xs px-4 py-4">
                                    <button
                                      onClick={() =>
                                        node.kind === "FOLDER"
                                          ? (setFolderId(node.id), setSearch(""))
                                          : setDetailId(node.id)
                                      }
                                      className="flex items-center gap-3 text-left"
                                    >
                                      <FileMark folder={node.kind === "FOLDER"} />
                                      <span className="min-w-0">
                                        <span className="block break-words font-medium">
                                          {node.name}
                                        </span>
                                        <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                                          {node.inherited ? "From workspace · " : ""}
                                          {node.kind === "FOLDER"
                                            ? node.connectionId
                                              ? "Connected folder"
                                              : "Platform folder"
                                            : `${node.origin === "GOOGLE_DRIVE" ? "Google Drive" : "Uploaded"} · ${node.bytes >= 1048576 ? (node.bytes / 1048576).toFixed(1) + " MB" : Math.ceil(node.bytes / 1024) + " KB"}`}
                                          {node.excluded ? " · Excluded for this project" : ""}
                                        </span>
                                      </span>
                                    </button>
                                  </td>
                                  <td className="hidden px-3 text-[11px] text-muted-foreground lg:table-cell">
                                    {node.origin === "GOOGLE_DRIVE" ? (
                                      <span className="flex items-center gap-1">
                                        <Link2 className="h-3 w-3" />
                                        Google Drive
                                      </span>
                                    ) : node.kind === "FOLDER" ? (
                                      "Platform"
                                    ) : (
                                      "Uploaded"
                                    )}
                                  </td>
                                  <td className="hidden px-3 sm:table-cell">
                                    {node.kind === "DOCUMENT" ? (
                                      <KnowledgeUse usage={node.usage} />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-2">
                                    <KnowledgeStatus node={node} />
                                  </td>
                                  <td className="pr-3">
                                    {node.inherited && canManage ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="px-1 text-[10px]"
                                        disabled={
                                          saving || (node.excluded && !node.directlyExcluded)
                                        }
                                        onClick={() =>
                                          perform(
                                            () =>
                                              knowledgeApi.exclude(
                                                groupId!,
                                                node.id,
                                                !node.directlyExcluded,
                                              ),
                                            node.directlyExcluded
                                              ? "Source included"
                                              : "Source excluded for this project",
                                          )
                                        }
                                      >
                                        {node.excluded ? "Include" : "Exclude"}
                                      </Button>
                                    ) : canManage ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Actions for ${node.name}`}
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onSelect={() => setDetailId(node.id)}>
                                            Details
                                          </DropdownMenuItem>
                                          {!node.connectionId && (
                                            <DropdownMenuItem onSelect={() => openFolder(node)}>
                                              Rename or move
                                            </DropdownMenuItem>
                                          )}
                                          {node.status === "ERROR" && !node.connectionId && (
                                            <DropdownMenuItem
                                              onSelect={() =>
                                                perform(
                                                  () => knowledgeApi.retry(node.id),
                                                  "Processing queued",
                                                )
                                              }
                                            >
                                              Retry processing
                                            </DropdownMenuItem>
                                          )}
                                          {!node.connectionId && (
                                            <DropdownMenuItem
                                              className="text-destructive"
                                              onSelect={() => setRemoving(node)}
                                            >
                                              Remove
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : node.kind === "DOCUMENT" ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`View ${node.name}`}
                                        onClick={() => setDetailId(node.id)}
                                      >
                                        <ChevronRight className="h-4 w-4" />
                                      </Button>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                              {!visible.length && (
                                <tr>
                                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                    {search
                                      ? "No matching sources. Try another search."
                                      : "This folder is empty."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="flex gap-2 border-t bg-muted/10 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {groupId
                          ? "Review and adjust selected sources before generating each report."
                          : "Workspace knowledge is available to projects automatically."}
                      </p>
                    </Card>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
      <Dialog open={modal === "folder"} onOpenChange={closeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rename or move source" : "New folder"}</DialogTitle>
            <DialogDescription>
              Keep related references and deliverables together.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-xs">
            Name
            <input
              aria-label="Folder or source name"
              className={field}
              value={folderName}
              maxLength={240}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </label>
          <label className="space-y-2 text-xs">
            Parent folder
            <select
              aria-label="Parent folder"
              className={field}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {folderOptions(true)}
            </select>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving || !folderName.trim()}
              onClick={async () => {
                if (
                  await perform(
                    () =>
                      editing
                        ? knowledgeApi.update(editing.id, {
                            name: folderName.trim(),
                            parentId: destination || null,
                          })
                        : knowledgeApi.folder(scope, folderName.trim(), destination || undefined),
                    editing ? "Source updated" : "Folder created",
                  )
                )
                  setModal(null);
              }}
            >
              {editing ? "Save changes" : "Create folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "upload"} onOpenChange={closeModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              Bring references and deliverables into your knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-xs">
              Destination folder
              <select
                aria-label="Upload destination"
                className={field}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={uploading}
              >
                {folderOptions()}
              </select>
            </label>
            <label className="space-y-2 text-xs">
              Use in reports
              <UsageSelect value={usage} onChange={setUsage} disabled={uploading} />
            </label>
          </div>
          <label
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/50 bg-[var(--brand-soft)]/30 p-7 text-center ${uploading ? "pointer-events-none opacity-50" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!uploading) appendFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mb-1 h-7 w-7 text-[var(--brand)]" />
            <span className="text-sm font-medium">Drop files here, or browse files</span>
            <span className="text-[11px] text-muted-foreground">
              PDF, DOCX, TXT, Markdown and CSV · Up to 20 MB per file
            </span>
            <input
              aria-label="Choose knowledge files"
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                appendFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <div className="divide-y">
            {uploads.map((row, index) => (
              <div key={index} className="flex gap-3 py-3">
                <FileMark />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="break-words text-xs">{row.file.name}</strong>
                    <span
                      className={`text-[10px] ${row.state === "error" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {row.state === "uploading"
                        ? `Uploading · ${row.progress}%`
                        : row.state === "processing"
                          ? "Uploaded · Processing"
                          : row.state === "error"
                            ? "Upload failed"
                            : "Ready to upload"}
                    </span>
                  </div>
                  {row.state === "uploading" && (
                    <progress
                      aria-label={`Upload progress for ${row.file.name}`}
                      className="mt-2 h-1 w-full accent-[var(--brand)]"
                      max={100}
                      value={row.progress}
                    />
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.error ?? `${(row.file.size / 1024).toFixed(0)} KB · ${usageLabel(usage)}`}
                  </p>
                </div>
                {row.state === "error" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => uploadRows(index)}
                  >
                    Retry
                  </Button>
                ) : (
                  row.state === "queued" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.file.name} from upload`}
                      disabled={uploading}
                      onClick={() => setUploads((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )
                )}
              </div>
            ))}
          </div>
          <Note>
            Context helps interpret the project. Evidence can support findings. Choose Both when a
            document serves both purposes. Files are selectable after processing finishes.
          </Note>
          <DialogFooter>
            <Button variant="ghost" disabled={uploading} onClick={() => setModal(null)}>
              Close
            </Button>
            <Button
              disabled={
                uploading || !uploads.some((r) => r.state === "queued" || r.state === "error")
              }
              onClick={() => uploadRows()}
            >
              {uploading ? "Uploading…" : "Upload files"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "drive"} onOpenChange={closeModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect Google Drive</DialogTitle>
            <DialogDescription>
              Choose files or folders to keep synchronized with this knowledge base.
            </DialogDescription>
          </DialogHeader>
          {!connections.data?.configured ? (
            <Note>
              Google Drive is not configured yet. An administrator must configure the Google OAuth
              client before connecting an account.
            </Note>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Google Drive account"
                  className={`${field} min-w-0 flex-1`}
                  value={driveId}
                  onChange={(e) => {
                    setDriveId(e.target.value);
                    setDrivePath([{ id: "root", name: "My Drive" }]);
                  }}
                >
                  <option value="">Choose an account</option>
                  {driveAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.email}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => authorize()}>
                  Connect account
                </Button>
              </div>
              {driveId && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDrivePath([{ id: "root", name: "My Drive" }]);
                        setDriveSearch("");
                      }}
                    >
                      My Drive
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDrivePath([{ id: "shared-drives", name: "Shared drives" }]);
                        setDriveSearch("");
                      }}
                    >
                      Shared drives
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {drivePath.map((p, index) => (
                      <span className="flex items-center gap-1" key={p.id}>
                        {index > 0 && <ChevronRight className="h-3 w-3" />}
                        <button
                          onClick={() => {
                            setDrivePath((path) => path.slice(0, index + 1));
                            setDriveSearch("");
                          }}
                        >
                          {p.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border p-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      aria-label="Search Google Drive"
                      placeholder="Search in Google Drive…"
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                    />
                  </label>
                  {driveFiles.isLoading ? (
                    <LoadingState />
                  ) : driveFiles.error ? (
                    <ErrorState
                      message={errorMessage(driveFiles.error)}
                      onRetry={() => driveFiles.refetch()}
                    />
                  ) : (
                    <div className="max-h-72 overflow-auto rounded-xl border divide-y">
                      {driveFiles.data?.pages
                        .flatMap((p) => p.files)
                        .map((item) => (
                          <div key={item.id} className="flex items-center gap-3 p-3">
                            <Checkbox
                              aria-label={`Connect ${item.name}`}
                              disabled={!item.supported || drivePath.at(-1)?.id === "shared-drives"}
                              checked={driveSelection.has(item.id)}
                              onCheckedChange={(checked) =>
                                setDriveSelection((current) => {
                                  const next = new Set(current);
                                  if (checked === true) next.add(item.id);
                                  else next.delete(item.id);
                                  return next;
                                })
                              }
                            />
                            <FileMark folder={item.mimeType === DRIVE_FOLDER} />
                            <button
                              disabled={item.mimeType !== DRIVE_FOLDER}
                              onClick={() => {
                                setDrivePath((path) => [...path, { id: item.id, name: item.name }]);
                                setDriveSearch("");
                              }}
                              className="min-w-0 flex-1 break-words text-left text-xs font-medium"
                            >
                              {item.name}
                              {!item.supported && (
                                <span className="mt-1 block font-normal text-muted-foreground">
                                  Unsupported format
                                </span>
                              )}
                            </button>
                            {item.mimeType === DRIVE_FOLDER && (
                              <ChevronRight className="h-3 w-3 shrink-0" />
                            )}
                          </div>
                        ))}
                      {driveFiles.data?.pages.every((p) => !p.files.length) && (
                        <p className="p-5 text-center text-xs text-muted-foreground">
                          No files found.
                        </p>
                      )}
                      {driveFiles.hasNextPage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          disabled={driveFiles.isFetchingNextPage}
                          onClick={() => driveFiles.fetchNextPage()}
                        >
                          Load more
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-xs">
                      Add to folder
                      <select
                        aria-label="Drive destination"
                        className={field}
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      >
                        {folderOptions()}
                      </select>
                    </label>
                    <label className="space-y-2 text-xs">
                      Default use for new documents
                      <UsageSelect value={usage} onChange={setUsage} />
                    </label>
                  </div>
                  <Note>
                    Automatic synchronization includes new documents and subfolders. Later changes
                    apply to future reports; saved reports keep their original references. Google
                    Sheets are imported as PDF.
                  </Note>
                  <DialogFooter>
                    <span className="mr-auto text-xs text-muted-foreground">
                      {driveSelection.size} items selected
                    </span>
                    <Button variant="ghost" onClick={() => setModal(null)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={saving || !driveSelection.size}
                      onClick={async () => {
                        if (
                          await perform(
                            () =>
                              knowledgeApi.configure(driveId, {
                                rootIds: [...driveSelection],
                                destinationId: destination || null,
                                usage,
                              }),
                            "Drive sources connected. Synchronization is queued.",
                          )
                        ) {
                          setModal(null);
                          setView("connections");
                        }
                      }}
                    >
                      Connect selected
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detail.data?.name ?? "Document details"}</DialogTitle>
            <DialogDescription>
              Preview the document and inspect its origin, version and use in reports.
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <LoadingState />
          ) : detail.error ? (
            <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
          ) : (
            detail.data && (
              <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-h-64 min-w-0 rounded-xl border bg-muted/20 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[var(--brand)]" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Extracted document text
                    </span>
                  </div>
                  <p className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {detail.data.version?.text ??
                      detail.data.error ??
                      "Preparing this document for reports…"}
                  </p>
                </div>
                <aside className="space-y-4">
                  <KnowledgeStatus node={detail.data} />
                  <dl className="divide-y text-xs">
                    {[
                      [
                        "Origin",
                        detail.data.origin === "GOOGLE_DRIVE" ? "Google Drive" : "Direct upload",
                      ],
                      ["Scope", detail.data.groupId ? "Project" : "Workspace"],
                      [
                        "Version",
                        detail.data.version?.revision.slice(0, 24) ?? "Not yet available",
                      ],
                      [
                        "Last synchronized",
                        detail.data.syncedAt
                          ? new Date(detail.data.syncedAt).toLocaleString()
                          : "—",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3 py-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="break-all text-right">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <label className="block space-y-2 text-xs">
                    Use in reports
                    <UsageSelect
                      value={detailUsage}
                      onChange={setDetailUsage}
                      disabled={!detail.data.canManage || Boolean(groupId && !detail.data.groupId)}
                    />
                  </label>
                  {groupId && !detail.data.groupId ? (
                    <Note>
                      <span className="mb-2 flex items-center gap-1">
                        <Share2 className="h-3 w-3" />
                        From workspace
                      </span>
                      <Link
                        to="/organizations/$organizationId/workspaces/$workspaceId"
                        params={{ organizationId, workspaceId }}
                        search={{ tab: "resources", knowledgeNode: detail.data.id }}
                        className="font-medium"
                      >
                        Edit in workspace →
                      </Link>
                    </Note>
                  ) : (
                    detail.data.canManage && (
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          perform(
                            () => knowledgeApi.update(detail.data!.id, { usage: detailUsage }),
                            "Source settings saved",
                          )
                        }
                      >
                        Save settings
                      </Button>
                    )
                  )}
                  {detail.data.version && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const blob = await downloadKnowledge(detail.data!.id);
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = detail.data!.name;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Download saved version
                    </Button>
                  )}
                  {detail.data.sourceUrl &&
                    /^https:\/\/(drive|docs)\.google\.com\//.test(detail.data.sourceUrl) && (
                      <a
                        className="block text-xs text-[var(--brand-ink)]"
                        href={detail.data.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Google Drive ↗
                      </a>
                    )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Source content is treated as reference material, never as instructions to the
                    evaluator. Scanned documents need readable text before they can be used.
                  </p>
                </aside>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove ${removing?.name}?`}
        description="This removes the source and its subfolders from this knowledge base. Saved report references remain available."
        destructive
        confirmLabel="Remove"
        onConfirm={async () => {
          if (
            removing &&
            (await perform(() => knowledgeApi.remove(removing.id), "Source removed"))
          ) {
            if (folderId === removing.id) setFolderId(null);
            setRemoving(null);
          }
        }}
      />
    </div>
  );
}
