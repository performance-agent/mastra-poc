import type {
  Organization,
  Workspace,
  Group,
  User,
  Membership,
  Resource,
  Integration,
  Role,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  statusCode: number;
  details?: string | string[];
  constructor(message: string, statusCode: number, details?: string | string[]) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Backend unavailable", 0);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new ApiError(text || res.statusText, res.status);
      return text as unknown as T;
    }
  }

  if (!res.ok) {
    const msg = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message || data?.error || res.statusText || "Request failed";
    throw new ApiError(msg, res.status, data?.message);
  }
  return data as T;
}

export const api = {
  health: () => request<unknown>("/"),

  // Organizations
  listOrganizations: () => request<Organization[]>("/organizations"),
  getOrganization: (id: string) => request<Organization>(`/organizations/${id}`),
  createOrganization: (body: Partial<Organization>) =>
    request<Organization>("/organizations", { method: "POST", body: JSON.stringify(body) }),
  updateOrganization: (id: string, body: Partial<Organization>) =>
    request<Organization>(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteOrganization: (id: string) =>
    request<void>(`/organizations/${id}`, { method: "DELETE" }),

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

  // Org resources
  listOrgResources: (id: string) => request<Resource[]>(`/organizations/${id}/resources`),
  getResource: (id: string) => request<Resource>(`/resources/${id}`),
  updateResource: (id: string, body: Partial<Resource>) =>
    request<Resource>(`/resources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Integrations
  listIntegrations: () => request<Integration[]>("/integrations"),
  setupGithub: (orgId: string, body: Record<string, unknown>) =>
    request<unknown>(`/organizations/${orgId}/integrations/github/setup`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

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

  // Workspace resource assignments
  assignWorkspaceResource: (workspaceId: string, resourceId: string) =>
    request<unknown>(`/workspaces/${workspaceId}/resources/${resourceId}`, { method: "PUT" }),
  unassignWorkspaceResource: (workspaceId: string, resourceId: string) =>
    request<unknown>(`/workspaces/${workspaceId}/resources/${resourceId}`, { method: "DELETE" }),

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

  assignGroupResource: (groupId: string, resourceId: string) =>
    request<unknown>(`/groups/${groupId}/resources/${resourceId}`, { method: "PUT" }),
  unassignGroupResource: (groupId: string, resourceId: string) =>
    request<unknown>(`/groups/${groupId}/resources/${resourceId}`, { method: "DELETE" }),

  // Users
  listUsers: () => request<User[]>("/users"),
  createUser: (body: Partial<User>) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
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
