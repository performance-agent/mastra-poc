import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
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
  RefreshCw,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
import { Breadcrumbs } from "./Breadcrumbs";
import { ContextTabs } from "./ContextTabs";
import { EmptyState } from "./EmptyState";
import { FormModal } from "./FormModal";
import { SearchInput } from "./SearchInput";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { KnowledgeStatus, KnowledgeUse } from "./KnowledgeSources";

const ROOT_DESTINATION = "__all_sources__";
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
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
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
    <Select
      value={value}
      onValueChange={(next) => onChange(next as KnowledgeUsage)}
      disabled={disabled}
    >
      <SelectTrigger aria-label="Use in reports">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["CONTEXT", "EVIDENCE", "BOTH"] as const).map((v) => (
          <SelectItem key={v} value={v}>
            {usageLabel(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Note({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
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
  const { firebaseUser } = useAuth();
  const userKey = firebaseUser?.uid;
  const qc = useQueryClient();
  const key = ["knowledge", workspaceId, groupId, userKey];
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
  const folderBaseline = useRef({ name: "", destination: "" });
  const [destination, setDestination] = useState("");
  const [usage, setUsage] = useState<KnowledgeUsage>("CONTEXT");
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(initialNodeId ?? null);
  const [detailUsage, setDetailUsage] = useState<KnowledgeUsage>("CONTEXT");
  const [removing, setRemoving] = useState<KnowledgeNode | null>(null);
  const [disconnecting, setDisconnecting] = useState<DriveConnection | null>(null);
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
    queryKey: ["knowledge-connections", workspaceId, groupId, userKey],
    queryFn: () => knowledgeApi.connections(scope),
    enabled: category === "knowledge",
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["knowledge-node", detailId, userKey],
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
    (c) => c.canManage && (c.groupId ?? null) === (groupId ?? null),
  );
  const driveFiles = useInfiniteQuery({
    queryKey: ["drive-files", driveId, drivePath.at(-1)?.id, driveQuery, userKey],
    queryFn: ({ pageParam }) =>
      knowledgeApi.browse(driveId, drivePath.at(-1)!.id, pageParam, driveQuery || undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: modal === "drive" && driveAccounts.some((c) => c.id === driveId),
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
    const connection = connections.data?.connections.find((c) => c.id === driveId && c.canManage);
    if (connection && seededDrive.current !== driveId) {
      seededDrive.current = driveId;
      setDriveSelection(new Set(connection.rootIds ?? []));
      setUsage(connection.usage ?? "CONTEXT");
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
    const parent = node
      ? (node.parentId ?? "")
      : current && !current.connectionId && !current.inherited
        ? current.id
        : "";
    folderBaseline.current = { name: node?.name ?? "", destination: parent };
    setEditing(node ?? null);
    setFolderName(node?.name ?? "");
    setDestination(parent);
    setModal("folder");
  }
  function openDrive(id?: string) {
    if (id && !driveAccounts.some((c) => c.id === id)) return;
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
  const folderSelect = (label: string, exclude = false, disabled = false) => (
    <Select
      value={destination || ROOT_DESTINATION}
      onValueChange={(next) => setDestination(next === ROOT_DESTINATION ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROOT_DESTINATION}>All sources</SelectItem>
        {folders
          .filter((f) => !exclude || !moveForbidden.has(f.id))
          .map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
  return (
    <div className="space-y-5" data-testid="knowledge-resources">
      <ContextTabs
        items={[
          { value: "knowledge", label: "Knowledge base" },
          { value: "plugins", label: "Plugin resources" },
        ]}
        value={category}
        onChange={(next) => setCategory(next as "knowledge" | "plugins")}
      />
      {category === "plugins" ? (
        children
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
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
              <Card className="min-w-0 h-fit rounded-xl p-3 shadow-card">
                <nav
                  aria-label="Knowledge navigation"
                  className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setView("library");
                      setFolderId(null);
                      setSearch("");
                    }}
                    aria-current={view === "library" && !folderId ? "page" : undefined}
                    className={`h-auto shrink-0 justify-start py-2.5 text-left ${view === "library" && !folderId ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]" : "text-muted-foreground"}`}
                  >
                    <BookOpen className="h-4 w-4" />
                    All sources
                    <span className="ml-auto hidden text-[10px] md:block">
                      {nodes.filter((n) => n.kind === "DOCUMENT").length}
                    </span>
                  </Button>
                  {nodes
                    .filter((n) => n.kind === "FOLDER")
                    .map((n) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        key={n.id}
                        onClick={() => {
                          setView("library");
                          setFolderId(n.id);
                          setSearch("");
                        }}
                        aria-current={folderId === n.id && view === "library" ? "page" : undefined}
                        className={`h-auto shrink-0 justify-start py-2 text-left ${folderId === n.id && view === "library" ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]" : "text-muted-foreground"} ${n.parentId ? "md:ml-3" : ""}`}
                      >
                        <Folder className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap md:whitespace-normal">{n.name}</span>
                        {n.connectionId && <Link2 className="h-3 w-3 shrink-0" />}
                      </Button>
                    ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("connections")}
                    aria-current={view === "connections" ? "page" : undefined}
                    className={`h-auto shrink-0 justify-start py-2.5 text-left md:mt-4 ${view === "connections" ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]" : "text-muted-foreground"}`}
                  >
                    <Link2 className="h-4 w-4" />
                    Connections
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openFolder()}
                      className="hidden items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground md:flex"
                    >
                      <Plus className="h-4 w-4" />
                      New folder
                    </Button>
                  )}
                  <p className="mt-5 hidden px-3 text-[11px] leading-relaxed text-muted-foreground md:block">
                    {groupId
                      ? "Shared workspace documents are referenced without making another copy."
                      : "Knowledge in this workspace is available to its projects automatically."}
                  </p>
                </nav>
              </Card>
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
                          <EmptyState
                            icon={<Link2 className="h-5 w-5" />}
                            title="No Drive connections yet"
                            description="Connect a Google account and choose files or folders to synchronize automatically."
                            actionLabel={
                              canManage && connections.data?.configured && !saving
                                ? "Connect Google Drive"
                                : undefined
                            }
                            onAction={() => authorize()}
                          />
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
                                    {connection.email ?? `Drive shared by ${connection.ownerName}`}
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
                                <Alert variant="destructive" className="mt-4">
                                  <AlertDescription>{connection.error}</AlertDescription>
                                </Alert>
                              )}
                              <div className="my-4 flex flex-wrap gap-6 border-y py-3 text-[11px] text-muted-foreground">
                                <span>
                                  Connected items
                                  <strong className="mt-1 block font-medium text-foreground">
                                    {connection.selectedItemCount}
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
                              {inherited && connection.canManage ? (
                                <Link
                                  to="/organizations/$organizationId/workspaces/$workspaceId"
                                  params={{ organizationId, workspaceId }}
                                  search={{ tab: "resources", knowledgeView: "connections" }}
                                  className="text-xs text-[var(--brand-ink)]"
                                >
                                  Manage in workspace →
                                </Link>
                              ) : connection.canManage ? (
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
                                    onClick={() => setDisconnecting(connection)}
                                  >
                                    Disconnect
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Managed by {connection.ownerName}. Only selected documents are
                                  shared; the account and the rest of Drive remain under its owner's
                                  control.
                                </p>
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
                      <div className="min-w-40 flex-1">
                        <SearchInput
                          ariaLabel="Search knowledge sources"
                          placeholder="Search files and folders…"
                          value={search}
                          onChange={setSearch}
                        />
                      </div>
                      <Select value={origin} onValueChange={setOrigin}>
                        <SelectTrigger aria-label="Filter sources by origin" className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All origins</SelectItem>
                          <SelectItem value="UPLOAD">Uploaded / platform</SelectItem>
                          <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Card className="overflow-hidden rounded-xl shadow-card">
                      <div className="border-b p-3">
                        <Breadcrumbs
                          items={[
                            {
                              label: "All sources",
                              onClick: () => {
                                setFolderId(null);
                                setSearch("");
                              },
                            },
                            ...breadcrumbs.map((node) => ({
                              label: node.name,
                              onClick: () => {
                                setFolderId(node.id);
                                setSearch("");
                              },
                            })),
                          ]}
                        />
                      </div>
                      {nodes.length === 0 ? (
                        <EmptyState
                          icon={<BookOpen className="h-5 w-5" />}
                          title="No knowledge sources yet"
                          description="Add project briefs, reference material or deliverables to use as context and evidence in reports."
                          actionLabel={canManage ? "Upload files" : undefined}
                          onAction={canManage ? openUpload : undefined}
                        />
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead className="hidden lg:table-cell">Origin</TableHead>
                                <TableHead className="hidden sm:table-cell">Report use</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="pr-3">
                                  <span className="sr-only">Actions</span>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {visible.map((node) => (
                                <TableRow
                                  key={node.id}
                                  className={node.excluded ? "opacity-55" : undefined}
                                >
                                  <TableCell className="max-w-xs">
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        node.kind === "FOLDER"
                                          ? (setFolderId(node.id), setSearch(""))
                                          : setDetailId(node.id)
                                      }
                                      className="h-auto w-full justify-start gap-3 whitespace-normal text-left"
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
                                    </Button>
                                  </TableCell>
                                  <TableCell className="hidden text-muted-foreground lg:table-cell">
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
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell">
                                    {node.kind === "DOCUMENT" ? (
                                      <KnowledgeUse usage={node.usage} />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="px-2">
                                    <KnowledgeStatus node={node} />
                                  </TableCell>
                                  <TableCell className="pr-3">
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
                                    ) : node.canManage ? (
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
                                  </TableCell>
                                </TableRow>
                              ))}
                              {!visible.length && (
                                <TableRow>
                                  <TableCell colSpan={5} className="p-3">
                                    <EmptyState
                                      icon={<Folder className="h-5 w-5" />}
                                      title={
                                        search || origin !== "all"
                                          ? "No matching sources"
                                          : "This folder is empty"
                                      }
                                      description={
                                        search || origin !== "all"
                                          ? "Try another search or origin filter."
                                          : "Add files or create a folder to organize your knowledge."
                                      }
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
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
      <FormModal
        open={modal === "folder"}
        onOpenChange={closeModal}
        title={editing ? "Rename or move source" : "New folder"}
        description="Keep related references and deliverables together."
        submitLabel={editing ? "Save changes" : "Create folder"}
        submitting={saving}
        submitDisabled={!folderName.trim()}
        dirty={
          folderName !== folderBaseline.current.name ||
          destination !== folderBaseline.current.destination
        }
        onSubmit={async () => {
          if (!folderName.trim()) return;
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
        <div className="space-y-1.5">
          <Label htmlFor="knowledge-folder-name">Name</Label>
          <Input
            id="knowledge-folder-name"
            aria-label="Folder or source name"
            value={folderName}
            maxLength={240}
            onChange={(e) => setFolderName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Parent folder</Label>
          {folderSelect("Parent folder", true)}
        </div>
      </FormModal>
      <Dialog open={modal === "upload"} onOpenChange={closeModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              Bring references and deliverables into your knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Destination folder</Label>
              {folderSelect("Upload destination", false, uploading)}
            </div>
            <div className="space-y-1.5">
              <Label>Use in reports</Label>
              <UsageSelect value={usage} onChange={setUsage} disabled={uploading} />
            </div>
          </div>
          <Label
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-7 text-center ${uploading ? "pointer-events-none opacity-50" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!uploading) appendFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mb-1 h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-medium">Drop files here, or browse files</span>
            <span className="text-[11px] text-muted-foreground">
              PDF, DOCX, TXT, Markdown and CSV · Up to 20 MB per file
            </span>
            <Input
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
          </Label>
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
                    <Progress
                      aria-label={`Upload progress for ${row.file.name}`}
                      className="mt-2"
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
            <Button variant="outline" disabled={uploading} onClick={() => setModal(null)}>
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
              Choose files or folders to share with this {groupId ? "project" : "workspace"}.
              Members can read, download and use imported documents in reports. New files inside
              selected folders are shared automatically. Only you manage this Drive connection.
            </DialogDescription>
          </DialogHeader>
          {!canManage ? (
            <Note>
              Only workspace or project owners and administrators can connect Google Drive accounts.
            </Note>
          ) : !connections.data?.configured ? (
            <Note>
              Google Drive is not configured yet. An administrator must configure the Google OAuth
              client before connecting an account.
            </Note>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={driveId}
                  onValueChange={(next) => {
                    setDriveId(next);
                    setDrivePath([{ id: "root", name: "My Drive" }]);
                  }}
                >
                  <SelectTrigger aria-label="Google Drive account" className="min-w-0 flex-1">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {driveAccounts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => authorize()}>
                  Connect account
                </Button>
              </div>
              {driveAccounts.some((c) => c.id === driveId) && (
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
                  <Breadcrumbs
                    items={drivePath.map((item, index) => ({
                      label: item.name,
                      onClick: () => {
                        setDrivePath((path) => path.slice(0, index + 1));
                        setDriveSearch("");
                      },
                    }))}
                  />
                  <SearchInput
                    ariaLabel="Search Google Drive"
                    placeholder="Search in Google Drive…"
                    value={driveSearch}
                    onChange={setDriveSearch}
                  />
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
                              id={`drive-source-${item.id}`}
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
                            {item.mimeType === DRIVE_FOLDER ? (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setDrivePath((path) => [
                                    ...path,
                                    { id: item.id, name: item.name },
                                  ]);
                                  setDriveSearch("");
                                }}
                                className="h-auto min-w-0 flex-1 flex-col items-start whitespace-normal break-words text-left"
                              >
                                {item.name}
                              </Button>
                            ) : (
                              <Label
                                htmlFor={`drive-source-${item.id}`}
                                className="min-w-0 flex-1 break-words leading-relaxed"
                              >
                                {item.name}
                                {!item.supported && (
                                  <span className="mt-1 block font-normal text-muted-foreground">
                                    Unsupported format
                                  </span>
                                )}
                              </Label>
                            )}
                            {item.mimeType === DRIVE_FOLDER && (
                              <ChevronRight className="h-3 w-3 shrink-0" />
                            )}
                          </div>
                        ))}
                      {driveFiles.data?.pages.every((p) => !p.files.length) && (
                        <EmptyState
                          title="No files found"
                          description="Try another search or folder."
                          icon={<FileText className="h-5 w-5" />}
                        />
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
                    <div className="space-y-1.5">
                      <Label>Add to folder</Label>
                      {folderSelect("Drive destination")}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Default use for new documents</Label>
                      <UsageSelect value={usage} onChange={setUsage} />
                    </div>
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
                    <Button variant="outline" onClick={() => setModal(null)}>
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
                  <div className="space-y-1.5">
                    <Label>Use in reports</Label>
                    <UsageSelect
                      value={detailUsage}
                      onChange={setDetailUsage}
                      disabled={!detail.data.canManage || Boolean(groupId && !detail.data.groupId)}
                    />
                  </div>
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
        open={Boolean(disconnecting)}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null);
        }}
        title="Disconnect Google Drive?"
        description="This disconnects the account and removes its sources from this knowledge base. Saved report references remain available."
        destructive
        confirmLabel="Disconnect"
        onConfirm={async () => {
          if (
            disconnecting &&
            (await perform(() => knowledgeApi.disconnect(disconnecting.id), "Drive disconnected"))
          )
            setDisconnecting(null);
        }}
      />
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
