import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Building2,
  Users,
  FolderTree,
  Boxes,
  Plug,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Database,
} from "lucide-react";

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
import { DataTypeFormDialog, type DataTypeFormValues } from "@/components/app/DataTypeFormDialog";
import { FormModal } from "@/components/app/FormModal";
import { ResourceCard } from "@/components/app/ResourceCard";
import { MemberList } from "@/components/app/MemberList";
import { UserPicker } from "@/components/app/UserPicker";
import { RoleSelect } from "@/components/app/RoleSelect";
import { SearchInput } from "@/components/app/SearchInput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { api, errorMessage } from "@/lib/api";
import { toFormInitial } from "@/lib/form-helpers";
import { savePendingGithubSetup } from "@/lib/github-setup";
import type { DataType, Integration, Resource, Role, Workspace } from "@/lib/types";

const tabSchema = z.object({
  tab: z.string().optional(),
});
const organizationTabs = [
  "overview",
  "workspaces",
  "members",
  "resources",
  "integrations",
  "data-types",
] as const;
type OrganizationTab = (typeof organizationTabs)[number];

export const Route = createFileRoute("/organizations/$organizationId")({
  validateSearch: tabSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Organization — Performance Agent` },
      {
        name: "description",
        content: `Workspace browser for organization ${params.organizationId}.`,
      },
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
  const dataTypesQ = useQuery({
    queryKey: ["organization", organizationId, "data-types"],
    queryFn: () => api.listOrgDataTypes(organizationId),
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
            items={[{ label: "Organizations", to: "/organizations" }, { label: org.name }]}
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
              { value: "data-types", label: "Data Types", count: dataTypesQ.data?.length },
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
          {tab === "data-types" && <DataTypesTab organizationId={organizationId} />}
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

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
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
        <StatCard
          icon={<Plug className="h-4 w-4" />}
          label="Integrations"
          value={integrations > 0 ? "Connected" : "—"}
        />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!userId}>
            Add
          </Button>
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

function dataTypeFields(schema: Record<string, unknown>) {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

function DataTypesTab({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DataType | null>(null);
  const [deleting, setDeleting] = useState<DataType | null>(null);
  const q = useQuery({
    queryKey: ["organization", organizationId, "data-types"],
    queryFn: () => api.listOrgDataTypes(organizationId),
  });
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return q.data ?? [];
    return (q.data ?? []).filter(
      (dataType) =>
        dataType.name.toLowerCase().includes(normalizedSearch) ||
        (dataType.description ?? "").toLowerCase().includes(normalizedSearch),
    );
  }, [q.data, search]);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "data-types"] });

  const createDataType = async (values: DataTypeFormValues) => {
    if (!values.schema) return;
    try {
      await api.createDataType(organizationId, {
        name: values.name,
        description: values.description,
        schema: values.schema,
      });
      toast.success("Data type created");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const updateDataType = async (values: DataTypeFormValues) => {
    if (!editing) return;
    try {
      await api.updateDataType(editing.id, {
        name: values.name,
        description: values.description ?? "",
        ...(values.schema ? { schema: values.schema } : {}),
      });
      toast.success("Data type updated");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search data types…" />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New data type
        </Button>
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Database className="h-4 w-4" />}
          title={search ? "No matching data types" : "No data types yet"}
          description={
            search
              ? "Try a different search term."
              : "Define structured data that performance agents can produce and consume."
          }
          actionLabel={search ? undefined : "New data type"}
          onAction={search ? undefined : () => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dataType) => {
            const fields = dataTypeFields(dataType.schema);
            return (
              <Card
                key={dataType.id}
                className="flex min-w-0 flex-col gap-4 rounded-xl p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{dataType.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {dataType.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        aria-label={`${dataType.name} actions`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(dataType)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleting(dataType)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {fields.length > 0 ? (
                    <>
                      {fields.slice(0, 4).map((field) => (
                        <span
                          key={field}
                          className="max-w-full truncate rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          {field}
                        </span>
                      ))}
                      {fields.length > 4 && (
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          +{fields.length - 4}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Custom schema</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DataTypeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createDataType}
      />
      <DataTypeFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        initial={editing}
        onSubmit={updateDataType}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This permanently removes the data type and its schema."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteDataType(deleting.id);
            toast.success("Data type deleted");
            setDeleting(null);
            await refresh();
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

type IntegrationView = {
  id?: string;
  key: string;
  name: string;
  displayName: string;
  type: string;
  description: string;
  setupUrl?: string;
  status: NonNullable<Integration["status"]> | "available";
  isGithub: boolean;
  isConnected: boolean;
  installationId?: string;
};

function integrationTypeKey(integration: Integration) {
  return (integration.provider ?? integration.type ?? "").toString().toUpperCase();
}

function integrationDisplayName(integration: Integration, type = integrationTypeKey(integration)) {
  return integration.displayName ?? (type === "GITHUB" ? "GitHub" : titleCaseProvider(type));
}

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
  const displayName = integrationDisplayName(integration, type);
  const name = integration.name ?? displayName;
  const status = integration.status ?? (options?.isConnected ? "ACTIVE" : "available");

  return {
    id: integration.id,
    key: integration.id ?? integration.provider ?? integration.type ?? `integration-${index}`,
    name,
    displayName,
    type,
    description:
      integration.description ??
      (type === "GITHUB"
        ? "Connect a GitHub App installation to import repositories as resources."
        : "Connect this integration to bring external resources into the workspace."),
    setupUrl: integration.setupUrl ?? options?.setupUrl,
    status,
    isGithub: type.includes("GITHUB") || displayName.toLowerCase().includes("github"),
    isConnected: options?.isConnected ?? false,
    installationId: integration.github?.installationId,
  };
}

function EditIntegrationDialog({
  integration,
  onOpenChange,
  onSubmit,
}: {
  integration: IntegrationView | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(integration?.name ?? "");
  }, [integration]);

  return (
    <FormModal
      open={!!integration}
      onOpenChange={onOpenChange}
      title="Edit integration"
      submitLabel="Save"
      submitting={submitting}
      onSubmit={async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
          await onSubmit(name.trim());
          onOpenChange(false);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="integration-name">Name</Label>
        <Input
          id="integration-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </div>
    </FormModal>
  );
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
  const qc = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<IntegrationView | null>(null);
  const availableQ = useQuery({ queryKey: ["integrations"], queryFn: api.listIntegrations });
  const connectedQ = useQuery({
    queryKey: ["organization", organizationId, "integrations"],
    queryFn: () => api.listOrgIntegrations(organizationId),
  });
  const connectedIntegrations = (connectedQ.data ?? []).map((integration, index) =>
    normalizeIntegration(integration, index, { isConnected: true }),
  );
  const availableIntegrations = availableQ.data ?? [];
  const integrations = connectedIntegrations;
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

  const handleAddIntegration = (integration: Integration) => {
    handleGithubSetup(integration.setupUrl);
  };

  const handleSyncIntegration = async (integration: IntegrationView) => {
    if (!integration.id) return;

    setSyncingId(integration.id);
    try {
      await api.syncIntegration(integration.id);
      toast.success(`${integration.name} synced`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["organization", organizationId, "integrations"] }),
        qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] }),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncingId(null);
    }
  };

  const handleUpdateIntegration = async (name: string) => {
    if (!editing?.id) return;

    try {
      await api.updateIntegration(editing.id, { name });
      toast.success("Integration updated");
      await qc.invalidateQueries({ queryKey: ["organization", organizationId, "integrations"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={availableQ.isLoading}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add integration
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableIntegrations.length > 0 ? (
              availableIntegrations.map((integration) => (
                <DropdownMenuItem
                  key={integrationTypeKey(integration)}
                  onClick={() => handleAddIntegration(integration)}
                >
                  <Plug className="mr-2 h-3.5 w-3.5" />
                  {integrationDisplayName(integration)}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>No integrations available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
          title="No integrations connected"
          description="Add an integration to bring external resources into this organization."
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
                    <p className="text-[11px] text-muted-foreground">{integration.displayName}</p>
                  </div>
                  <IntegrationStatusBadge status={integration.status} />
                </div>
                <p className="max-w-xl text-xs text-muted-foreground">{integration.description}</p>
                {integration.installationId && (
                  <p className="text-[11px] text-muted-foreground">
                    Installation ID: {integration.installationId}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    aria-label={`${integration.name} actions`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {integration.isConnected && integration.id && (
                    <DropdownMenuItem
                      onClick={() => handleSyncIntegration(integration)}
                      disabled={syncingId === integration.id}
                    >
                      <RefreshCw
                        className={`mr-2 h-3.5 w-3.5 ${
                          syncingId === integration.id ? "animate-spin" : ""
                        }`}
                      />
                      Sync
                    </DropdownMenuItem>
                  )}
                  {integration.isConnected && integration.id && (
                    <DropdownMenuItem onClick={() => setEditing(integration)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}
      <EditIntegrationDialog
        integration={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={handleUpdateIntegration}
      />
    </div>
  );
}
