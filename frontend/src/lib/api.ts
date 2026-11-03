import { normalizeSetup } from "./experience";
import type { Appearance, Preferences, Setup } from "./experience";
import type { GradingSettings, GenerationJob } from "./types";
import type {
  Organization,
  Workspace,
  Group,
  User,
  Membership,
  Invitation,
  InvitationPreview,
  Resource,
  PluginCatalogItem,
  WorkspacePeople,
  McpConnection,
  PluginInstallation,
  DataType,
  PerformanceReport,
  ReportNote,
  ReportRevision,
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  Evaluator,
  EvaluatorInput,
  Personality,
  Role,
  EvaluationRequest,
  EvaluationReport,
  SavedEvaluation,
  EvaluationHistoryPage,
  RulePackage,
  RulePackageInput,
} from "./types";
import { getFirebaseAuth } from "./firebase";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  statusCode: number;
  details?: string | string[];
  constructor(message: string, statusCode: number, details?: string | string[]) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser?.getIdToken();
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const token = await getAccessToken();
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Backend unavailable", 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new ApiError(text || res.statusText, res.status);
      return text as unknown as T;
    }
  }

  if (!res.ok) {
    const payload =
      typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
    const payloadMessage = payload?.message;
    const msg = Array.isArray(payloadMessage)
      ? payloadMessage.join(", ")
      : typeof payloadMessage === "string"
        ? payloadMessage
        : typeof payload?.error === "string"
          ? payload.error
          : res.statusText || "Request failed";
    const details =
      typeof payloadMessage === "string"
        ? payloadMessage
        : Array.isArray(payloadMessage) && payloadMessage.every((item) => typeof item === "string")
          ? (payloadMessage as string[])
          : undefined;
    throw new ApiError(msg, res.status, details);
  }
  return data as T;
}

export const api = {
  createTeamSpace: (
    org: string,
    body: { workspaceName: string; groupName: string; description?: string },
  ) =>
    request<{ workspace: Workspace; group: Group }>(`/organizations/${org}/team-space`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  savePersonalization: (body: {
    profile?: { name: string; photoUrl: string | null };
    personal?: Partial<Pick<Preferences, "theme" | "motion">>;
    organizationId?: string;
    home?: Partial<Pick<Preferences, "blocks" | "favorites">>;
    organization?: { appearance: Omit<Appearance, "canEdit">; photoUrl: string };
  }) =>
    request<{ saved: boolean }>("/users/me/personalization", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  me: () => request<User>("/users/me"),
  saveProfile: (body: { name: string; photoUrl?: string | null }) =>
    request<User>("/users/me", { method: "PATCH", body: JSON.stringify(body) }),
  preferences: (org?: string) =>
    request<Preferences>(org ? `/organizations/${org}/me/preferences` : "/users/me/preferences"),
  savePreferences: (body: Preferences, org?: string) =>
    request<Preferences>(org ? `/organizations/${org}/me/preferences` : "/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  appearance: (org: string) => request<Appearance>(`/organizations/${org}/appearance`),
  saveAppearance: (org: string, body: Appearance) =>
    request<Appearance>(`/organizations/${org}/appearance`, {
      method: "PATCH",
      body: JSON.stringify({
        version: body.version,
        color: body.color,
        cover: body.cover,
        blocks: body.blocks,
      }),
    }),
  setup: (org: string) => request<Setup>(`/organizations/${org}/me/setup`).then(normalizeSetup),
  saveSetup: (org: string, body: Setup) =>
    request<Setup>(`/organizations/${org}/me/setup`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getIndividualInsightsJob: (workspaceId: string, jobId: string) =>
    request<GenerationJob<EvaluationReport["individualInsights"]>>(
      `/workspaces/${workspaceId}/evaluations/jobs/${jobId}`,
    ),
  getEvaluationJob: async (workspaceId: string, jobId: string, signal?: AbortSignal) => {
    const job = await request<GenerationJob<EvaluationReport | { evaluationId: string }>>(
      `/workspaces/${workspaceId}/evaluations/jobs/${jobId}`,
      { signal },
    );
    // Full-view jobs store graph state, while the workbench renders saved reports.
    if (job.result && !("assessments" in job.result)) {
      const saved = await request<SavedEvaluation>(
        `/workspaces/${workspaceId}/evaluations/${job.result.evaluationId}`,
        { signal },
      );
      return {
        ...job,
        result: { ...saved.data.report, evaluationId: saved.id, createdAt: saved.createdAt },
      };
    }
    return { ...job, result: job.result };
  },
  getLatestEvaluationJob: (workspaceId: string, groupId: string, signal?: AbortSignal) =>
    request<GenerationJob<EvaluationReport> | null>(
      `/workspaces/${workspaceId}/evaluations/jobs/latest?${new URLSearchParams({ groupId })}`,
      { signal },
    ),
  startEvaluationWorkspace: (workspaceId: string, body: EvaluationRequest) =>
    request<{ jobId: string; status: string }>(
      `/workspaces/${workspaceId}/evaluations?view=report`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  getGradingSettings: (id: string) =>
    request<GradingSettings>(`/workspaces/${id}/evaluations/grading-settings`),
  saveGradingSettings: (id: string, settings: GradingSettings) =>
    request<GradingSettings>(`/workspaces/${id}/evaluations/grading-settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  listStoredTasks: (id: string, groupId: string, search = "") =>
    request<
      Array<{ id: string; operation: string; externalId: string; payload: Record<string, unknown> }>
    >(`/workspaces/${id}/evaluations/tasks?${new URLSearchParams({ groupId, search })}`),
  syncStatus: (id: string, groupId: string) =>
    request<
      Array<{
        resourceId: string;
        operation: string;
        checkpoint: string | null;
        nextRetryAt: string | null;
        error: string | null;
      }>
    >(`/workspaces/${id}/evaluations/sync-status?groupId=${encodeURIComponent(groupId)}`),
  analyzeTask: (id: string, body: { groupId: string; recordId?: string; description?: string }) =>
    submitJob<{ result: Record<string, string> }>(
      `/workspaces/${id}/evaluations/task-analysis`,
      { method: "POST", body: JSON.stringify(body) },
      `/workspaces/${id}/evaluations/jobs`,
    ),
  health: () => request<unknown>("/"),
  getMcpAuthorization: (authorizationId: string) =>
    request<{
      clientName: string;
      redirectHost: string;
      loopbackRedirect: boolean;
      scopes: string[];
    }>(`/oauth/authorizations/${authorizationId}`),
  approveMcpAuthorization: (authorizationId: string) =>
    request<{ redirectUrl: string }>(`/oauth/authorizations/${authorizationId}/approve`, {
      method: "POST",
    }),

  // Organizations
  listOrganizations: () => request<Organization[]>("/organizations"),
  getOrganization: (id: string) => request<Organization>(`/organizations/${id}`),
  createOrganization: (body: Partial<Organization>) =>
    request<Organization>("/organizations", { method: "POST", body: JSON.stringify(body) }),
  updateOrganization: (id: string, body: Partial<Organization>) =>
    request<Organization>(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteOrganization: (id: string) => request<void>(`/organizations/${id}`, { method: "DELETE" }),

  // Organization data types
  listOrgDataTypes: (id: string) => request<DataType[]>(`/organizations/${id}/data-types`),
  createDataType: (
    organizationId: string,
    body: Pick<DataType, "name" | "schema"> & { description?: string },
  ) =>
    request<DataType>(`/organizations/${organizationId}/data-types`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getDataType: (id: string) => request<DataType>(`/data-types/${id}`),
  updateDataType: (id: string, body: Partial<Pick<DataType, "name" | "description" | "schema">>) =>
    request<DataType>(`/data-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDataType: (id: string) => request<void>(`/data-types/${id}`, { method: "DELETE" }),

  // Org → Workspaces
  listOrgWorkspaces: (id: string) => request<Workspace[]>(`/organizations/${id}/workspaces`),
  createWorkspace: (id: string, body: Partial<Workspace>) =>
    request<Workspace>(`/organizations/${id}/workspaces`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
  updateWorkspace: (id: string, body: Partial<Workspace>) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteWorkspace: (id: string) => request<void>(`/workspaces/${id}`, { method: "DELETE" }),

  // Org members
  listOrgMembers: (id: string) => request<Membership[]>(`/organizations/${id}/members`),
  upsertOrgMember: (id: string, userId: string, role: Role) =>
    request<Membership>(`/organizations/${id}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  removeOrgMember: (id: string, userId: string) =>
    request<void>(`/organizations/${id}/members/${userId}`, { method: "DELETE" }),
  listOrgInvitations: (id: string) => request<Invitation[]>(`/organizations/${id}/invitations`),
  createOrgInvitation: (id: string, email: string, role: Role) =>
    request<Invitation>(`/organizations/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeOrgInvitation: (id: string, invitationId: string) =>
    request<void>(`/organizations/${id}/invitations/${invitationId}`, { method: "DELETE" }),

  // Org resources
  listOrgResources: (id: string) => request<Resource[]>(`/organizations/${id}/resources`),
  getResource: (id: string) => request<Resource>(`/resources/${id}`),
  updateResource: (id: string, body: Partial<Resource>) =>
    request<Resource>(`/resources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Plugins and installations
  listPlugins: () => request<PluginCatalogItem[]>("/plugins"),
  getMcpConnection: () => request<McpConnection>("/mcp/connection"),
  getWorkspacePeople: (workspaceId: string, evaluatorId?: string) =>
    request<WorkspacePeople>(
      `/workspaces/${encodeURIComponent(workspaceId)}/people${evaluatorId ? `?evaluatorId=${encodeURIComponent(evaluatorId)}` : ""}`,
    ),
  listOrgPluginInstallations: (id: string) =>
    request<PluginInstallation[]>(`/organizations/${id}/plugin-installations`),
  syncPluginInstallation: (id: string) =>
    request<PluginInstallation>(`/plugin-installations/${id}/sync`, { method: "POST" }),
  updatePluginInstallation: (
    id: string,
    body: Pick<PluginInstallation, "name"> & { configuration?: Record<string, unknown> },
  ) =>
    request<PluginInstallation>(`/plugin-installations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  setupGithub: (organizationId: string, body: Record<string, unknown>) =>
    request<unknown>(`/organizations/${organizationId}/plugin-installations/github/setup`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  setupJira: (organizationId: string, body: Record<string, unknown>) =>
    request<PluginInstallation>(
      `/organizations/${organizationId}/plugin-installations/jira/setup`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  // Workspaces → groups
  listWorkspaceGroups: (id: string) => request<Group[]>(`/workspaces/${id}/groups`),
  createGroup: (id: string, body: Partial<Group>) =>
    request<Group>(`/workspaces/${id}/groups`, { method: "POST", body: JSON.stringify(body) }),

  // Workspace members
  listWorkspaceMembers: (id: string) => request<Membership[]>(`/workspaces/${id}/members`),
  upsertWorkspaceMember: (id: string, userId: string, role: Role) =>
    request<Membership>(`/workspaces/${id}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  removeWorkspaceMember: (id: string, userId: string) =>
    request<void>(`/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
  listWorkspaceInvitations: (id: string) => request<Invitation[]>(`/workspaces/${id}/invitations`),
  createWorkspaceInvitation: (id: string, email: string, role: Role) =>
    request<Invitation>(`/workspaces/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeWorkspaceInvitation: (id: string, invitationId: string) =>
    request<void>(`/workspaces/${id}/invitations/${invitationId}`, { method: "DELETE" }),

  // Workspace resource assignments
  listWorkspaceResources: (id: string) => request<Resource[]>(`/workspaces/${id}/resources`),
  assignWorkspaceResource: (workspaceId: string, resourceId: string) =>
    request<unknown>(`/workspaces/${workspaceId}/resources/${resourceId}`, { method: "PUT" }),
  unassignWorkspaceResource: (workspaceId: string, resourceId: string) =>
    request<unknown>(`/workspaces/${workspaceId}/resources/${resourceId}`, { method: "DELETE" }),
  evaluateWorkspace: (workspaceId: string, body: EvaluationRequest, view: "report" | "full") =>
    submitJob<EvaluationReport>(
      `/workspaces/${workspaceId}/evaluations?view=${view}`,
      { method: "POST", body: JSON.stringify(body) },
      `/workspaces/${workspaceId}/evaluations/jobs`,
    ),
  listEvaluations: (workspaceId: string, groupId: string, cursor?: string) => {
    const query = new URLSearchParams({ groupId });
    if (cursor) query.set("cursor", cursor);
    return request<EvaluationHistoryPage>(`/workspaces/${workspaceId}/evaluations?${query}`);
  },
  getEvaluation: (workspaceId: string, evaluationId: string) =>
    request<SavedEvaluation>(`/workspaces/${workspaceId}/evaluations/${evaluationId}`),
  listRulePackages: (workspaceId: string) =>
    request<RulePackage[]>(`/workspaces/${workspaceId}/rule-packages`),
  createRulePackage: (workspaceId: string, body: RulePackageInput) =>
    request<RulePackage>(`/workspaces/${workspaceId}/rule-packages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRulePackage: (workspaceId: string, packageId: string, body: Partial<RulePackageInput>) =>
    request<RulePackage>(`/workspaces/${workspaceId}/rule-packages/${packageId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRulePackage: (workspaceId: string, packageId: string) =>
    request<void>(`/workspaces/${workspaceId}/rule-packages/${packageId}`, {
      method: "DELETE",
    }),

  // Groups
  getGroup: (id: string) => request<Group>(`/groups/${id}`),
  updateGroup: (id: string, body: Partial<Group>) =>
    request<Group>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteGroup: (id: string) => request<void>(`/groups/${id}`, { method: "DELETE" }),

  listGroupMembers: (id: string) => request<Membership[]>(`/groups/${id}/members`),
  upsertGroupMember: (id: string, userId: string, role: Role) =>
    request<Membership>(`/groups/${id}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  removeGroupMember: (id: string, userId: string) =>
    request<void>(`/groups/${id}/members/${userId}`, { method: "DELETE" }),
  listGroupInvitations: (id: string) => request<Invitation[]>(`/groups/${id}/invitations`),
  createGroupInvitation: (id: string, email: string, role: Role) =>
    request<Invitation>(`/groups/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeGroupInvitation: (id: string, invitationId: string) =>
    request<void>(`/groups/${id}/invitations/${invitationId}`, { method: "DELETE" }),
  getInvitation: (token: string) => request<InvitationPreview>(`/invitations/${token}`),
  acceptInvitation: (token: string) =>
    request<InvitationPreview>(`/invitations/${token}/accept`, { method: "POST" }),

  listGroupResources: (id: string) => request<Resource[]>(`/groups/${id}/resources`),
  assignGroupResource: (groupId: string, resourceId: string) =>
    request<unknown>(`/groups/${groupId}/resources/${resourceId}`, { method: "PUT" }),
  unassignGroupResource: (groupId: string, resourceId: string) =>
    request<unknown>(`/groups/${groupId}/resources/${resourceId}`, { method: "DELETE" }),
  createGroupReport: (groupId: string, body: { type: "GROUP_REPORT" }) =>
    submitJob<unknown>(
      `/groups/${groupId}/reports`,
      { method: "POST", body: JSON.stringify(body) },
      `/groups/${groupId}/generation-jobs`,
    ),
  startEvaluatorReports: (
    groupId: string,
    evaluatorIds: string[],
    options?: {
      contextByEvaluator?: Record<string, string>;
      period?: { from: string; to: string };
      knowledgeSelection?: { sourceIds: string[]; folderIds?: string[] };
    },
  ) =>
    request<{ jobs: Array<{ jobId: string; evaluatorId: string; status: string }> }>(
      `/groups/${groupId}/reports`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "GROUP_REPORT",
          evaluatorIds,
          ...(options?.contextByEvaluator && Object.keys(options.contextByEvaluator).length > 0
            ? { contextByEvaluator: options.contextByEvaluator }
            : {}),
          ...(options?.period ? { period: options.period } : {}),
          ...(options?.knowledgeSelection
            ? { knowledgeSelection: options.knowledgeSelection }
            : {}),
        }),
      },
    ),
  getGroupGenerationJob: (groupId: string, jobId: string, signal?: AbortSignal) =>
    request<GenerationJob<unknown>>(`/groups/${groupId}/generation-jobs/${jobId}`, { signal }),
  listActiveGroupReports: (groupId: string) =>
    request<Array<{ jobId: string; evaluatorId: string; status: "queued" | "running" }>>(
      `/groups/${groupId}/generation-jobs`,
    ),
  cancelQueuedGroupReport: (groupId: string, jobId: string) =>
    request<{ status: "failed" }>(`/groups/${groupId}/generation-jobs/${jobId}/cancel`, {
      method: "POST",
    }),
  listPersonalities: (groupId: string) =>
    request<Personality[]>(`/groups/${groupId}/personalities`),
  createPersonality: (groupId: string, body: { name: string; instruction: string }) =>
    request<Personality>(`/groups/${groupId}/personalities`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePersonality: (id: string, body: { name: string; instruction: string }) =>
    request<Personality>(`/personalities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePersonality: (id: string) => request<void>(`/personalities/${id}`, { method: "DELETE" }),
  listEvaluators: (groupId: string) => request<Evaluator[]>(`/groups/${groupId}/evaluators`),
  createEvaluator: (groupId: string, body: EvaluatorInput) =>
    request<Evaluator>(`/groups/${groupId}/evaluators`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEvaluator: (id: string, body: Partial<EvaluatorInput>) =>
    request<Evaluator>(`/evaluators/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEvaluator: (id: string) => request<void>(`/evaluators/${id}`, { method: "DELETE" }),
  deleteReport: (id: string) => request<void>(`/reports/${id}`, { method: "DELETE" }),
  updateReport: (id: string, body: { title: string | null }) =>
    request<PerformanceReport>(`/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listReportRevisions: (id: string) => request<ReportRevision[]>(`/reports/${id}/revisions`),
  saveReportNotes: (id: string, notes: ReportNote[]) =>
    request<{ id: string; position: number; notes: ReportNote[] }>(`/reports/${id}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),
  reviseReport: (id: string, notes: ReportNote[]) =>
    request<{ jobId: string; status: string }>(`/reports/${id}/revisions`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  listGroupReports: (groupId: string) =>
    request<
      Array<PerformanceReport<GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport>>
    >(`/groups/${groupId}/reports`),
  getReport: (id: string) =>
    request<PerformanceReport<GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport>>(
      `/reports/${id}`,
    ),

  // Users
  listUsers: () => request<User[]>("/users"),
  getUser: (id: string) => request<User>(`/users/${id}`),
  updateUser: (id: string, body: Partial<User>) =>
    request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

async function submitJob<T>(path: string, init: RequestInit, statusPath: string): Promise<T> {
  const { jobId } = await request<{ jobId: string }>(path, init);
  const deadline = Date.now() + 31 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await request<{ status: string; result: T; error?: string }>(
      statusPath + "/" + jobId,
    );
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(job.error ?? "Generation failed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Generation timed out. Job: " + jobId);
}
