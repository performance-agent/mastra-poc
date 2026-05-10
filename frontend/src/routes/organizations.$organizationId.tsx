import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Building2, Users, FolderTree, Boxes, Plug } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { EntityHeader } from "@/components/app/EntityHeader";
import { ContextTabs } from "@/components/app/ContextTabs";
import { EntityCard } from "@/components/app/EntityCard";
import { EmptyState } from "@/components/app/EmptyState";
import { LoadingState } from "@/components/app/LoadingState";
import { ErrorState } from "@/components/app/ErrorState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EntityFormDialog } from "@/components/app/EntityFormDialog";
import { ResourceCard } from "@/components/app/ResourceCard";
import { MemberList } from "@/components/app/MemberList";
import { UserPicker } from "@/components/app/UserPicker";
import { RoleSelect } from "@/components/app/RoleSelect";
import { SearchInput } from "@/components/app/SearchInput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { api, errorMessage } from "@/lib/api";
import { toFormInitial } from "@/lib/form-helpers";
import { savePendingGithubSetup } from "@/lib/github-setup";
import type { Integration, Resource, Role, Workspace } from "@/lib/types";

const tabSchema = z.object({
  tab: z.string().optional(),
});
const organizationTabs = ["overview", "workspaces", "members", "resources", "integrations"] as const;
type OrganizationTab = (typeof organizationTabs)[number];

export const Route = createFileRoute("/organizations/$organizationId")({
  validateSearch: tabSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Organization — Performance Agent` },
      { name: "description", content: `Workspace browser for organization ${params.organizationId}.` },
    ],
  }),
  component: OrganizationPage,
});

function OrganizationPage() {
  const { organizationId } = Route.useParams();
  const isNestedRoute = useRouterState({
    select: (state) =>
      state.location.pathname.replace(/\/$/, "") !== `/organizations/${organizationId}`,
  });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = organizationTabs.includes(search.tab as OrganizationTab)
    ? (search.tab as OrganizationTab)
    : "overview";
  const setTab = (value: string) =>
    navigate({ search: { tab: value === "overview" ? undefined : (value as never) } });

  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const orgQ = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId),
  });
  const workspacesQ = useQuery({
    queryKey: ["organization", organizationId, "workspaces"],
    queryFn: () => api.listOrgWorkspaces(organizationId),
  });
  const membersQ = useQuery({
    queryKey: ["organization", organizationId, "members"],
    queryFn: () => api.listOrgMembers(organizationId),
  });
  const resourcesQ = useQuery({
    queryKey: ["organization", organizationId, "resources"],
    queryFn: () => api.listOrgResources(organizationId),
  });
  const orgIntegrationsQ = useQuery({
    queryKey: ["organization", organizationId, "integrations"],
    queryFn: () => api.listOrgIntegrations(organizationId),
  });

  const refreshOrg = () => qc.invalidateQueries({ queryKey: ["organization", organizationId] });
  const refreshList = () => qc.invalidateQueries({ queryKey: ["organizations"] });

  const org = orgQ.data;

  if (isNestedRoute) {
    return <Outlet />;
  }

  return (
    <AppShell>
      {orgQ.isLoading ? (
        <LoadingState />
      ) : orgQ.error || !org ? (
        <ErrorState message={errorMessage(orgQ.error)} onRetry={() => orgQ.refetch()} />
      ) : (
        <div className="space-y-6">
          <Breadcrumbs
            items={[
              { label: "Organizations", to: "/organizations" },
              { label: org.name },
            ]}
          />
          <EntityHeader
            name={org.name}
            description={org.description}
            photoUrl={org.photoUrl}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <ContextTabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "overview", label: "Overview" },
              { value: "workspaces", label: "Workspaces", count: workspacesQ.data?.length },
              { value: "members", label: "Members", count: membersQ.data?.length },
              { value: "resources", label: "Resources", count: resourcesQ.data?.length },
              { value: "integrations", label: "Integrations" },
            ]}
          />

          {tab === "overview" && (
            <OverviewTab
              workspaces={workspacesQ.data?.length ?? 0}
              members={membersQ.data?.length ?? 0}
              resources={resourcesQ.data?.length ?? 0}
              integrations={orgIntegrationsQ.data?.length ?? 0}
              recentResources={resourcesQ.data?.slice(0, 4) ?? []}
            />
          )}
          {tab === "workspaces" && <WorkspacesTab organizationId={organizationId} />}
          {tab === "members" && <MembersTab organizationId={organizationId} />}
          {tab === "resources" && <ResourcesTab organizationId={organizationId} />}
          {tab === "integrations" && <IntegrationsTab organizationId={organizationId} />}
        </div>
      )}

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit organization"
        initial={toFormInitial(org)}
        onSubmit={async (v) => {
          try {
            await api.updateOrganization(organizationId, v);
            toast.success("Organization updated");
            refreshOrg();
            refreshList();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${org?.name}?`}
        destructive
        confirmLabel="Delete"
        description="This permanently removes the organization."
        onConfirm={async () => {
          try {
            await api.deleteOrganization(organizationId);
            toast.success("Organization deleted");
            setDeleteOpen(false);
            refreshList();
            navigate({ to: "/organizations" });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="flex items-center gap-3 rounded-xl border-border p-4 shadow-card">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
  );
}

function OverviewTab({
  workspaces,
  members,
  resources,
  integrations,
  recentResources,
}: {
  workspaces: number;
  members: number;
  resources: number;
  integrations: number;
  recentResources: Resource[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FolderTree className="h-4 w-4" />} label="Workspaces" value={workspaces} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Members" value={members} />
        <StatCard icon={<Boxes className="h-4 w-4" />} label="Resources" value={resources} />
        <StatCard icon={<Plug className="h-4 w-4" />} label="Integrations" value={integrations > 0 ? "Connected" : "—"} />
      </div>
      {recentResources.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent resources</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {recentResources.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspacesTab({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  const q = useQuery({
    queryKey: ["organization", organizationId, "workspaces"],
    queryFn: () => api.listOrgWorkspaces(organizationId),
  });

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    return s ? list.filter((w) => w.name.toLowerCase().includes(s)) : list;
  }, [q.data, search]);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "workspaces"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search workspaces…" />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New workspace
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="h-4 w-4" />}
          title="No workspaces yet"
          description="Create a workspace to organize groups, members, and resources."
          actionLabel="New workspace"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <EntityCard
              key={w.id}
              name={w.name}
              description={w.description}
              photoUrl={w.photoUrl}
              to="/organizations/$organizationId/workspaces/$workspaceId"
              params={{ organizationId, workspaceId: w.id }}
              onEdit={() => setEditing(w)}
              onDelete={() => setDeleting(w)}
            />
          ))}
        </div>
      )}

      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New workspace"
        submitLabel="Create"
        onSubmit={async (v) => {
          try {
            await api.createWorkspace(organizationId, v);
            toast.success("Workspace created");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <EntityFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Edit workspace"
        initial={toFormInitial(editing)}
        onSubmit={async (v) => {
          if (!editing) return;
          try {
            await api.updateWorkspace(editing.id, v);
            toast.success("Workspace updated");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteWorkspace(deleting.id);
            toast.success("Workspace deleted");
            setDeleting(null);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function MembersTab({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const membersQ = useQuery({
    queryKey: ["organization", organizationId, "members"],
    queryFn: () => api.listOrgMembers(organizationId),
  });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const [addOpen, setAddOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<Role>("VIEWER");

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "members"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add member
        </Button>
      </div>
      {membersQ.isLoading ? (
        <LoadingState />
      ) : membersQ.error ? (
        <ErrorState message={errorMessage(membersQ.error)} onRetry={() => membersQ.refetch()} />
      ) : (
        <MemberList
          members={membersQ.data ?? []}
          users={usersQ.data ?? []}
          onInvite={() => setAddOpen(true)}
          onRoleChange={async (uid, r) => {
            try {
              await api.upsertOrgMember(organizationId, uid, r);
              toast.success("Role updated");
              refresh();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
          onRemove={async (uid) => {
            try {
              await api.removeOrgMember(organizationId, uid);
              toast.success("Member removed");
              refresh();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      )}

      <AddMemberDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) {
            setUserId(undefined);
            setRole("VIEWER");
          }
        }}
        users={usersQ.data ?? []}
        excludeIds={(membersQ.data ?? []).map((m) => m.userId)}
        userId={userId}
        setUserId={setUserId}
        role={role}
        setRole={setRole}
        onConfirm={async () => {
          if (!userId) return;
          try {
            await api.upsertOrgMember(organizationId, userId, role);
            toast.success("Member added");
            setAddOpen(false);
            setUserId(undefined);
            setRole("VIEWER");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  users,
  excludeIds,
  userId,
  setUserId,
  role,
  setRole,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: { id: string; name: string; email: string; photoUrl?: string | null }[];
  excludeIds: string[];
  userId?: string;
  setUserId: (id?: string) => void;
  role: Role;
  setRole: (r: Role) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>User</Label>
            <UserPicker
              users={users.filter((u) => !excludeIds.includes(u.id))}
              value={userId}
              onChange={setUserId}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <RoleSelect value={role} onChange={setRole} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!userId}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourcesTab({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Resource | null>(null);
  const q = useQuery({
    queryKey: ["organization", organizationId, "resources"],
    queryFn: () => api.listOrgResources(organizationId),
  });
  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(s) ||
            (r.fullName ?? r.githubRepository?.fullName ?? "").toLowerCase().includes(s),
        )
      : list;
  }, [q.data, search]);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search resources…" />
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-4 w-4" />}
          title="No resources yet"
          description="Connect an integration to bring in resources like GitHub repositories."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((r) => (
            <ResourceCard key={r.id} resource={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}
      <EntityFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Edit resource"
        initial={
          editing
            ? { name: editing.name, description: editing.description ?? undefined }
            : undefined
        }
        onSubmit={async (v) => {
          if (!editing) return;
          try {
            await api.updateResource(editing.id, {
              name: v.name,
              description: v.description,
            });
            toast.success("Resource updated");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

type IntegrationView = {
  key: string;
  name: string;
  type: string;
  description: string;
  setupUrl?: string;
  status: NonNullable<Integration["status"]> | "available";
  isGithub: boolean;
  isConnected: boolean;
  installationId?: string;
};

function titleCaseProvider(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeIntegration(
  integration: Integration,
  index: number,
  options?: { isConnected?: boolean; setupUrl?: string },
): IntegrationView {
  const rawType = integration.type ?? integration.provider ?? "integration";
  const type = rawType.toString().toUpperCase();
  const name = integration.name ?? (type === "GITHUB" ? "GitHub" : titleCaseProvider(type));
  const status = integration.status ?? (options?.isConnected ? "ACTIVE" : "available");

  return {
    key: integration.id ?? integration.provider ?? integration.type ?? `integration-${index}`,
    name,
    type,
    description:
      integration.description ??
      (type === "GITHUB"
        ? "Connect a GitHub App installation to import repositories as resources."
        : "Connect this integration to bring external resources into the workspace."),
    setupUrl: integration.setupUrl ?? options?.setupUrl,
    status,
    isGithub: type.includes("GITHUB") || name.toLowerCase().includes("github"),
    isConnected: options?.isConnected ?? false,
    installationId: integration.github?.installationId,
  };
}

function integrationStatusLabel(status: IntegrationView["status"]) {
  const normalized = status.toString().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "CONNECTED") return "Connected";
  if (normalized === "PENDING" || normalized === "AVAILABLE") return "Available";
  if (normalized === "DISABLED") return "Disabled";
  if (normalized === "REVOKED") return "Revoked";
  if (normalized === "ERROR") return "Error";
  return titleCaseProvider(normalized);
}

function integrationStatusClasses(status: IntegrationView["status"]) {
  const normalized = status.toString().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "CONNECTED") {
    return {
      shell: "border-success/20 bg-success/10 text-success",
      dot: "bg-success",
    };
  }
  if (normalized === "PENDING") {
    return {
      shell: "border-warning/25 bg-warning/10 text-warning",
      dot: "bg-warning",
    };
  }
  if (["DISABLED", "REVOKED", "ERROR"].includes(normalized)) {
    return {
      shell: "border-destructive/20 bg-destructive/10 text-destructive",
      dot: "bg-destructive",
    };
  }
  return {
    shell: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/70",
  };
}

function IntegrationStatusBadge({ status }: { status: IntegrationView["status"] }) {
  const classes = integrationStatusClasses(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes.shell}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
      {integrationStatusLabel(status)}
    </span>
  );
}

function IntegrationsTab({ organizationId }: { organizationId: string }) {
  const availableQ = useQuery({ queryKey: ["integrations"], queryFn: api.listIntegrations });
  const connectedQ = useQuery({
    queryKey: ["organization", organizationId, "integrations"],
    queryFn: () => api.listOrgIntegrations(organizationId),
  });
  const availableSetupUrls = new Map(
    (availableQ.data ?? []).map((integration) => [
      (integration.provider ?? integration.type ?? "").toString().toUpperCase(),
      integration.setupUrl,
    ]),
  );
  const connectedIntegrations = (connectedQ.data ?? []).map((integration, index) =>
    normalizeIntegration(integration, index, {
      isConnected: true,
      setupUrl: availableSetupUrls.get(
        (integration.provider ?? integration.type ?? "").toString().toUpperCase(),
      ),
    }),
  );
  const connectedTypes = new Set(connectedIntegrations.map((integration) => integration.type));
  const availableIntegrations = (availableQ.data ?? [])
    .filter((integration) => {
      const type = (integration.provider ?? integration.type ?? "").toString().toUpperCase();
      return !connectedTypes.has(type);
    })
    .map((integration, index) => normalizeIntegration(integration, index));
  const integrations = [...connectedIntegrations, ...availableIntegrations];
  const isLoading = availableQ.isLoading || connectedQ.isLoading;
  const error = availableQ.error ?? connectedQ.error;

  const handleGithubSetup = (setupUrl?: string) => {
    if (setupUrl) {
      savePendingGithubSetup(organizationId);
      window.location.assign(setupUrl);
      return;
    }

    toast.message("No setup URL available", {
      description: "This integration does not provide a setup link yet.",
    });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            availableQ.refetch();
            connectedQ.refetch();
          }}
        />
      ) : integrations.length === 0 ? (
        <EmptyState
          icon={<Plug className="h-4 w-4" />}
          title="No integrations available"
          description="Integrations will appear here when they are configured on the server."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {integrations.map((integration) => (
            <Card
              key={integration.key}
              className="flex flex-col gap-4 rounded-xl p-4 shadow-card sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Plug className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{integration.name}</h3>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      {integration.type}
                    </p>
                  </div>
                  <IntegrationStatusBadge status={integration.status} />
                </div>
                <p className="max-w-xl text-xs text-muted-foreground">
                  {integration.description}
                </p>
                {integration.installationId && (
                  <p className="text-[11px] text-muted-foreground">
                    Installation ID: {integration.installationId}
                  </p>
                )}
              </div>
              {integration.isGithub && integration.setupUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={() => handleGithubSetup(integration.setupUrl)}
                >
                  {integration.isConnected ? "Manage" : "Setup"}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
