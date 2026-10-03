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
  PluginInstallation,
  DataType,
  PerformanceReport,
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  Role,
  EvaluationRequest,
  EvaluationReport,
  SavedEvaluation,
  EvaluationHistoryPage,
  RulePackage,
  RulePackageInput,
} from "./types";
import { getFirebaseAuth } from "./firebase";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  statusCode: number;
  details?: string | string[];
  constructor(message: string, statusCode: number, details?: string | string[]) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function getAccessToken(): Promise<string | undefined> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser?.getIdToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const token = await getAccessToken();
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
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
    request<EvaluationReport | Record<string, unknown>>(
      `/workspaces/${workspaceId}/evaluations?view=${view}`,
      { method: "POST", body: JSON.stringify(body) },
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
    request<{ status: "CREATING"; type: "GROUP_REPORT"; groupId: string }>(
      `/groups/${groupId}/reports`,
      { method: "POST", body: JSON.stringify(body) },
    ),
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
