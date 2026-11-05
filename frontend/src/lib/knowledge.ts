import { API_BASE_URL, ApiError, getAccessToken, request } from "./api";

export type KnowledgeScope = { workspaceId: string; groupId?: string };
export type KnowledgeUsage = "CONTEXT" | "EVIDENCE" | "BOTH";
export type KnowledgeVersion = {
  id: string;
  revision: string;
  digest: string;
  createdAt: string;
  bytes: number;
  mimeType: string;
  text?: string;
};
export type KnowledgeNode = {
  id: string;
  workspaceId: string;
  groupId: string | null;
  parentId: string | null;
  connectionId: string | null;
  name: string;
  kind: "FOLDER" | "DOCUMENT";
  origin: "UPLOAD" | "GOOGLE_DRIVE";
  usage: KnowledgeUsage;
  status: "READY" | "PROCESSING" | "ERROR" | "UNAVAILABLE";
  mimeType: string | null;
  bytes: number;
  sourceUrl: string | null;
  sourceRevision: string | null;
  error: string | null;
  syncedAt: string | null;
  updatedAt: string;
  inherited?: boolean;
  excluded?: boolean;
  directlyExcluded?: boolean;
  version?: KnowledgeVersion | null;
  canManage?: boolean;
  canRead: boolean;
  canUseInReports: boolean;
};
export type KnowledgeLibrary = { canManage: boolean; nodes: KnowledgeNode[] };
export type DriveConnection = {
  id: string;
  workspaceId: string;
  groupId: string | null;
  ownerName: string;
  isOwner: boolean;
  canManage: boolean;
  selectedItemCount: number;
  email?: string;
  accountId?: string;
  rootIds?: string[];
  destinationId?: string | null;
  usage?: KnowledgeUsage;
  status: "CONNECTED" | "RECONNECT" | "ERROR";
  lastSyncedAt: string | null;
  nextSyncAt?: string;
  error: string | null;
};
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  supported: boolean;
  size?: string;
};
export type KnowledgeReportSnapshot = {
  capturedAt: string;
  unavailable: number;
  sources: Array<{
    id: string;
    versionId: string;
    name: string;
    origin: string;
    usage: KnowledgeUsage;
    scope: "workspace" | "project";
    revision: string;
    digest: string;
    sourceUrl: string | null;
    totalCharacters: number;
    includedCharacters: number;
    excerpts: Array<{ reference: string; offset: number; text: string }>;
  }>;
};

export const usageLabel = (usage: KnowledgeUsage) =>
  usage === "BOTH" ? "Both" : usage === "EVIDENCE" ? "Evidence" : "Context";
export function knowledgeDescendants(nodes: KnowledgeNode[], ids: Iterable<string>) {
  const set = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parentId && set.has(n.parentId) && !set.has(n.id)) {
        set.add(n.id);
        changed = true;
      }
  }
  return set;
}
const qs = (scope: KnowledgeScope) =>
  new URLSearchParams({
    workspaceId: scope.workspaceId,
    ...(scope.groupId ? { groupId: scope.groupId } : {}),
  }).toString();
const json = (method: string, body?: unknown) => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
export const knowledgeApi = {
  list: (scope: KnowledgeScope) => request<KnowledgeLibrary>(`/knowledge?${qs(scope)}`),
  detail: (id: string) => request<KnowledgeNode>(`/knowledge/nodes/${encodeURIComponent(id)}`),
  folder: (scope: KnowledgeScope, name: string, parentId?: string) =>
    request<KnowledgeNode>("/knowledge/folders", json("POST", { ...scope, name, parentId })),
  update: (id: string, body: { name?: string; parentId?: string | null; usage?: KnowledgeUsage }) =>
    request<KnowledgeNode>(`/knowledge/nodes/${encodeURIComponent(id)}`, json("PATCH", body)),
  remove: (id: string) => request(`/knowledge/nodes/${encodeURIComponent(id)}`, json("DELETE")),
  retry: (id: string) => request(`/knowledge/nodes/${encodeURIComponent(id)}/retry`, json("POST")),
  exclude: (groupId: string, id: string, excluded: boolean) =>
    request(
      `/knowledge/projects/${encodeURIComponent(groupId)}/exclusions/${encodeURIComponent(id)}`,
      json("PUT", { excluded }),
    ),
  connections: (scope: KnowledgeScope) =>
    request<{ configured: boolean; connections: DriveConnection[] }>(
      `/knowledge/drive/connections?${qs(scope)}`,
    ),
  authorize: (scope: KnowledgeScope, connectionId?: string) =>
    request<{ url: string }>(
      "/knowledge/drive/authorize",
      json("POST", { ...scope, connectionId }),
    ),
  browse: (connectionId: string, parentId: string, pageToken?: string, search?: string) =>
    request<{ files: DriveItem[]; nextPageToken?: string }>(
      `/knowledge/drive/connections/${encodeURIComponent(connectionId)}/files?${new URLSearchParams({ parentId, ...(pageToken ? { pageToken } : {}), ...(search ? { search } : {}) })}`,
    ),
  configure: (
    id: string,
    body: { rootIds: string[]; destinationId?: string | null; usage: KnowledgeUsage },
  ) =>
    request(`/knowledge/drive/connections/${encodeURIComponent(id)}/selection`, json("PUT", body)),
  sync: (id: string) =>
    request(`/knowledge/drive/connections/${encodeURIComponent(id)}/sync`, json("POST")),
  disconnect: (id: string) =>
    request(`/knowledge/drive/connections/${encodeURIComponent(id)}`, json("DELETE")),
};

export async function uploadKnowledge(
  scope: KnowledgeScope,
  file: File,
  parentId: string | undefined,
  usage: KnowledgeUsage,
  onProgress: (percentage: number) => void,
) {
  const token = await getAccessToken();
  const form = new FormData();
  form.set("workspaceId", scope.workspaceId);
  if (scope.groupId) form.set("groupId", scope.groupId);
  if (parentId) form.set("parentId", parentId);
  form.set("usage", usage);
  form.set("file", file);
  return new Promise<{ id: string; status: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/knowledge/uploads`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("Upload connection interrupted. Retry this file.", 0));
    xhr.ontimeout = () => reject(new ApiError("The upload timed out. Retry this file.", 0));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(data.message ?? "Upload failed", xhr.status));
      } catch {
        reject(new ApiError("The upload response could not be read", xhr.status));
      }
    };
    xhr.send(form);
  });
}
export async function downloadKnowledge(id: string, versionId?: string) {
  const token = await getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/knowledge/nodes/${encodeURIComponent(id)}/download${versionId ? "?versionId=" + encodeURIComponent(versionId) : ""}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) throw new ApiError("The document could not be downloaded", response.status);
  return response.blob();
}
