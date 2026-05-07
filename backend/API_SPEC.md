# Performance Agent API Specification

## Base URL

All routes use the global prefix:

```txt
/api
```

Swagger is available at:

```txt
/api/docs
```

The API currently has no authentication or guards.

## Conventions

Requests with a body must be sent as JSON:

```http
Content-Type: application/json
```

Typical NestJS error shape:

```ts
type ApiError = {
  statusCode: number;
  message: string | string[];
  error?: string;
};
```

API clients should support:

- `message` as a string.
- `message` as an array of strings.
- Empty responses.
- Unexpected non-JSON failures.

## Health

### `GET /api/`

Returns:

```ts
"Hello World!"
```

Use this endpoint to verify backend availability.

## Organizations

### Entity

```ts
type Organization = {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### Inputs

```ts
type CreateOrganizationInput = {
  name: string;
  description?: string;
  photoUrl?: string;
};

type UpdateOrganizationInput = Partial<CreateOrganizationInput>;
```

### `POST /api/organizations`

Creates an organization.

Body:

```json
{
  "name": "Acme",
  "description": "Optional description",
  "photoUrl": "https://example.com/photo.png"
}
```

Response:

```ts
Organization
```

### `GET /api/organizations`

Lists all organizations.

Response:

```ts
Organization[]
```

### `GET /api/organizations/options`

Lists organizations in a lightweight option format.

Response:

```ts
type OrganizationOption = {
  id: string;
  name: string;
};

OrganizationOption[]
```

### `GET /api/organizations/:id`

Gets an organization by ID.

Response:

```ts
Organization | null
```

### `PATCH /api/organizations/:id`

Updates an organization.

Body:

```json
{
  "name": "Updated name",
  "description": "Updated description",
  "photoUrl": "https://example.com/new-photo.png"
}
```

Response:

```ts
Organization
```

### `DELETE /api/organizations/:id`

Deletes an organization.

Response:

```ts
Organization
```

## Workspaces

A workspace belongs to an organization.

### Entity

```ts
type Workspace = {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};
```

### Inputs

```ts
type CreateWorkspaceInput = {
  name: string;
  description?: string;
  photoUrl?: string;
};

type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;
```

### `POST /api/organizations/:id/workspaces`

Creates a workspace inside an organization.

`:id` is `organizationId`.

Body:

```json
{
  "name": "Engineering",
  "description": "Optional description",
  "photoUrl": "https://example.com/photo.png"
}
```

Response:

```ts
Workspace
```

Relevant error:

- If the organization does not exist, the API returns `400 Bad Request`.

### `GET /api/organizations/:id/workspaces`

Lists workspaces for an organization.

`:id` is `organizationId`.

Response:

```ts
Workspace[]
```

### `GET /api/workspaces/:id`

Gets a workspace by ID.

Response:

```ts
Workspace | null
```

### `PATCH /api/workspaces/:id`

Updates a workspace.

Body:

```json
{
  "name": "Updated workspace",
  "description": "Updated description",
  "photoUrl": "https://example.com/new-photo.png"
}
```

Response:

```ts
Workspace
```

### `DELETE /api/workspaces/:id`

Deletes a workspace.

Response:

```ts
Workspace
```

## Groups

A group belongs to a workspace.

### Entity

```ts
type Group = {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
};
```

### Inputs

```ts
type CreateGroupInput = {
  name: string;
  description?: string;
  photoUrl?: string;
};

type UpdateGroupInput = Partial<CreateGroupInput>;
```

### `POST /api/workspaces/:id/groups`

Creates a group inside a workspace.

`:id` is `workspaceId`.

Body:

```json
{
  "name": "Backend Team",
  "description": "Optional description",
  "photoUrl": "https://example.com/photo.png"
}
```

Response:

```ts
Group
```

### `GET /api/workspaces/:id/groups`

Lists groups for a workspace.

`:id` is `workspaceId`.

Response:

```ts
Group[]
```

### `GET /api/groups/:id`

Gets a group by ID.

Response:

```ts
Group | null
```

### `PATCH /api/groups/:id`

Updates a group.

Body:

```json
{
  "name": "Updated group",
  "description": "Updated description",
  "photoUrl": "https://example.com/new-photo.png"
}
```

Response:

```ts
Group
```

### `DELETE /api/groups/:id`

Deletes a group.

Response:

```ts
Group
```

## Users

### Entity

```ts
type User = {
  id: string;
  firebaseUid: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### Inputs

```ts
type CreateUserInput = {
  firebaseUid: string;
  name: string;
  email: string;
  photoUrl?: string;
};

type UpdateUserInput = {
  firebaseUid?: string;
  name?: string;
  email?: string;
  photoUrl?: string;
};
```

Although `firebaseUid` exists in the inherited update DTO, the current service only updates `name`, `email`, and `photoUrl`.

### `POST /api/users`

Creates a user.

Body:

```json
{
  "firebaseUid": "firebase_uid_123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "photoUrl": "https://example.com/avatar.png"
}
```

Response:

```ts
User
```

### `GET /api/users`

Lists all users.

Response:

```ts
User[]
```

### `GET /api/users/:id`

Gets a user by ID.

Response:

```ts
User | null
```

### `PATCH /api/users/:id`

Updates a user.

Body:

```json
{
  "name": "Jane Updated",
  "email": "jane.updated@example.com",
  "photoUrl": "https://example.com/new-avatar.png"
}
```

Response:

```ts
User
```

### `DELETE /api/users/:id`

Deletes a user.

Response:

```ts
User
```

## Memberships

A membership links a user to an organization, workspace, or group.

### Role Enum

```ts
type MembershipRole = "OWNER" | "ADMIN" | "VIEWER";
```

### Entity

```ts
type Membership = {
  id: string;
  userId: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  groupId?: string | null;
  role: MembershipRole;
  createdAt: string;
  updatedAt: string;
};
```

### Input

```ts
type SetMemberInput = {
  role: MembershipRole;
};
```

### `PUT /api/organizations/:id/members/:userId`

Creates or updates a member in an organization.

`:id` is `organizationId`.

Body:

```json
{
  "role": "ADMIN"
}
```

Response:

```ts
Membership
```

### `GET /api/organizations/:id/members`

Lists members for an organization.

Response:

```ts
Membership[]
```

### `DELETE /api/organizations/:id/members/:userId`

Removes a member from an organization.

Response:

```ts
Membership
```

### `PUT /api/workspaces/:id/members/:userId`

Creates or updates a member in a workspace.

`:id` is `workspaceId`.

Body:

```json
{
  "role": "VIEWER"
}
```

Response:

```ts
Membership
```

### `GET /api/workspaces/:id/members`

Lists members for a workspace.

Response:

```ts
Membership[]
```

### `DELETE /api/workspaces/:id/members/:userId`

Removes a member from a workspace.

Response:

```ts
Membership
```

### `PUT /api/groups/:id/members/:userId`

Creates or updates a member in a group.

`:id` is `groupId`.

Body:

```json
{
  "role": "OWNER"
}
```

Response:

```ts
Membership
```

### `GET /api/groups/:id/members`

Lists members for a group.

Response:

```ts
Membership[]
```

### `DELETE /api/groups/:id/members/:userId`

Removes a member from a group.

Response:

```ts
Membership
```

## Integrations

### Enums

```ts
type IntegrationProvider = "GITHUB" | "JIRA";

type IntegrationStatus = "PENDING" | "ACTIVE" | "DISABLED" | "REVOKED";
```

### Entity

```ts
type Integration = {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  github?: GithubIntegration | null;
};

type GithubIntegration = {
  integrationId: string;
  installationId: string;
};
```

### `GET /api/integrations`

Lists integrations available for setup.

Current response:

```ts
type AvailableIntegration = {
  provider: "GITHUB";
  setupUrl?: string;
};

AvailableIntegration[]
```

Example:

```json
[
  {
    "provider": "GITHUB",
    "setupUrl": "https://github.com/apps/..."
  }
]
```

## GitHub Setup

### Input

```ts
type SetupGithubInput = {
  installationId: string;
  setupAction: string;
};
```

### `POST /api/organizations/:id/integrations/github/setup`

Sets up GitHub for an organization.

`:id` is `organizationId`.

Body:

```json
{
  "installationId": "123456",
  "setupAction": "install"
}
```

Response:

```ts
Integration
```

The response includes:

```ts
{
  github: {
    integrationId: string;
    installationId: string;
  }
}
```

Rules:

- `setupAction` must be exactly `"install"`.
- Any other `setupAction` returns `400 Bad Request`.
- The backend uses the GitHub App installation to list accessible repositories.
- The backend creates one `Integration` with `provider = "GITHUB"` and `status = "ACTIVE"`.
- The backend creates one `IntegrationResource` for each repository.
- The backend creates one `GithubRepository` for each resource.

Useful frontend query params after the GitHub callback:

```txt
installation_id
installationId
setup_action
setupAction
```

## Resources

A resource represents an external resource associated with an integration. Currently, resources are GitHub repositories.

### Enums

```ts
type IntegrationResourceType = "REPOSITORY";
```

### Entity

```ts
type IntegrationResource = {
  id: string;
  name: string;
  description?: string | null;
  externalId: string;
  type: IntegrationResourceType;
  integrationId: string;
  createdAt: string;
  updatedAt: string;
  githubRepository?: GithubRepository | null;
};

type GithubRepository = {
  resourceId: string;
  fullName: string;
  defaultBranch?: string | null;
  htmlUrl?: string | null;
  isPrivate?: boolean | null;
  createdAt: string;
  updatedAt: string;
};
```

### Input

```ts
type UpdateResourceInput = {
  name: string;
  description?: string;
};
```

`name` is required when updating a resource.

### `GET /api/organizations/:id/resources`

Lists resources for an organization.

`:id` is `organizationId`.

Response:

```ts
IntegrationResource[]
```

Each resource includes:

```ts
githubRepository: GithubRepository | null
```

### `GET /api/resources/:id`

Gets a resource by ID.

Response:

```ts
IntegrationResource | null
```

The response includes `githubRepository`.

### `PATCH /api/resources/:id`

Updates a resource name and description.

Body:

```json
{
  "name": "Repository display name",
  "description": "Optional description"
}
```

Response:

```ts
IntegrationResource
```

The response includes `githubRepository`.

## Resource Assignments

A resource can be assigned to workspaces or groups.

### Entity

```ts
type IntegrationResourceAssignment = {
  id: string;
  resourceId: string;
  workspaceId?: string | null;
  groupId?: string | null;
  createdAt: string;
};
```

Rules:

- An assignment points to a workspace or a group.
- For workspace assignments, `groupId` is `null`.
- For group assignments, `workspaceId` is `null`.
- `PUT` endpoints use upsert and are idempotent.
- Assignments are unique by `(resourceId, workspaceId)` and `(resourceId, groupId)`.

### `PUT /api/workspaces/:id/resources/:resourceId`

Assigns a resource to a workspace.

`:id` is `workspaceId`.

Response:

```ts
IntegrationResourceAssignment
```

### `DELETE /api/workspaces/:id/resources/:resourceId`

Unassigns a resource from a workspace.

Response:

```ts
IntegrationResourceAssignment
```

### `PUT /api/groups/:id/resources/:resourceId`

Assigns a resource to a group.

`:id` is `groupId`.

Response:

```ts
IntegrationResourceAssignment
```

### `DELETE /api/groups/:id/resources/:resourceId`

Unassigns a resource from a group.

Response:

```ts
IntegrationResourceAssignment
```

## Domain Relationships

### Organization Hierarchy

```txt
Organization
  -> Workspace[]
      -> Group[]
```

### Membership Hierarchy

```txt
User
  -> Membership
      -> Organization | Workspace | Group
```

### Integration Hierarchy

```txt
Organization
  -> Integration
      -> IntegrationResource
          -> GithubRepository?
```

### Assignment Hierarchy

```txt
IntegrationResource
  -> IntegrationResourceAssignment
      -> Workspace? | Group?
```

## Frontend Coverage Checklist

A frontend client should cover:

- Health check with `GET /api/`.
- CRUD for organizations.
- CRUD for workspaces inside organizations.
- CRUD for groups inside workspaces.
- CRUD for users.
- Member management for organizations.
- Member management for workspaces.
- Member management for groups.
- Listing available integrations.
- GitHub integration setup for organizations.
- Reading GitHub callback query params.
- Listing resources by organization.
- Displaying GitHub metadata for resources.
- Editing resource `name` and `description`.
- Assigning and unassigning resources to workspaces.
- Assigning and unassigning resources to groups.
- Visible loading, empty, error, and debug states.

## Important Constraints

- Do not invent additional endpoints.
- Do not assume authentication.
- Do not assume server-side pagination, filtering, or search.
- Do not assume memberships include full user data. They currently return only the `Membership` entity.
- Do not assume resources include assignments. They currently include `githubRepository`, but not `integrationResourceAssignments`.
- Do not assume organizations include embedded workspaces. Load workspaces separately.
- Do not assume workspaces include embedded groups. Load groups separately.
