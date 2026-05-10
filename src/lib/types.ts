export type Role = "OWNER" | "ADMIN" | "VIEWER";

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  id: string;
  organizationId?: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  firebaseUid?: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Membership {
  id?: string;
  userId: string;
  role: Role;
  createdAt?: string;
}

export interface Resource {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  fullName?: string;
  defaultBranch?: string;
  private?: boolean;
  htmlUrl?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  description?: string;
  setupUrl?: string;
  status?: "connected" | "available" | "error";
}
