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
import type {
  DataType,
  PluginCatalogItem,
  PluginInstallation,
  Resource,
  Role,
  Workspace,
} from "@/lib/types";

const tabSchema = z.object({
  tab: z.string().optional(),
});
const organizationTabs = [
  "overview",
  "workspaces",
  "members",
  "resources",
  "plugins",
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
  const normalizedTab = search.tab === "integrations" ? "plugins" : search.tab;
  const tab = organizationTabs.includes(normalizedTab as OrganizationTab)
    ? (normalizedTab as OrganizationTab)
    : "overview";
  const setTab = (value: string) =>
    navigate({ search: { tab: value === "overview" ? undefined : (value as never) } });

  useEffect(() => {
    if (search.tab === "integrations") {
      navigate({ search: { tab: "plugins" as never }, replace: true });
    }
  }, [navigate, search.tab]);

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
  const orgPluginInstallationsQ = useQuery({
    queryKey: ["organization", organizationId, "plugin-installations"],
    queryFn: () => api.listOrgPluginInstallations(organizationId),
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
              { value: "plugins", label: "Plugins" },
              { value: "data-types", label: "Data Types", count: dataTypesQ.data?.length },
            ]}
          />

          {tab === "overview" && (
            <OverviewTab
              workspaces={workspacesQ.data?.length ?? 0}
              members={membersQ.data?.length ?? 0}
              resources={resourcesQ.data?.length ?? 0}
              dataTypes={dataTypesQ.data?.length ?? 0}
              plugins={
                new Set((orgPluginInstallationsQ.data ?? []).map((item) => item.pluginId)).size
              }
              recentResources={resourcesQ.data?.slice(0, 4) ?? []}
            />
          )}
          {tab === "workspaces" && <WorkspacesTab organizationId={organizationId} />}
          {tab === "members" && <MembersTab organizationId={organizationId} />}
          {tab === "resources" && <ResourcesTab organizationId={organizationId} />}
          {tab === "plugins" && <PluginsTab organizationId={organizationId} />}
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
  dataTypes,
  plugins,
  recentResources,
}: {
  workspaces: number;
  members: number;
  resources: number;
  dataTypes: number;
  plugins: number;
  recentResources: Resource[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<FolderTree className="h-4 w-4" />} label="Workspaces" value={workspaces} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Members" value={members} />
        <StatCard icon={<Boxes className="h-4 w-4" />} label="Resources" value={resources} />
        <StatCard icon={<Database className="h-4 w-4" />} label="Data Types" value={dataTypes} />
        <StatCard icon={<Plug className="h-4 w-4" />} label="Plugins" value={plugins} />
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
  const [addOpen, setAddOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<Role>("VIEWER");
  const membersQ = useQuery({
    queryKey: ["organization", organizationId, "members"],
    queryFn: () => api.listOrgMembers(organizationId),
  });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: api.listUsers, enabled: addOpen });

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
        usersLoading={usersQ.isLoading}
        usersError={usersQ.error}
        retryUsers={() => usersQ.refetch()}
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
  usersLoading,
  usersError,
  retryUsers,
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
  usersLoading: boolean;
  usersError: unknown;
  retryUsers: () => void;
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
            {usersLoading ? (
              <LoadingState />
            ) : usersError ? (
              <ErrorState message={errorMessage(usersError)} onRetry={retryUsers} />
            ) : (
              <UserPicker
                users={users.filter((u) => !excludeIds.includes(u.id))}
                value={userId}
                onChange={setUserId}
              />
            )}
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
            (r.fullName ?? r.githubRepository?.fullName ?? r.externalId ?? "")
              .toLowerCase()
              .includes(s),
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
          description="Connect a plugin to bring in resources like GitHub repositories."
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

function titleCaseProvider(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function EditPluginInstallationDialog({
  installation,
  plugin,
  onOpenChange,
  onSubmit,
}: {
  installation: PluginInstallation | null;
  plugin?: PluginCatalogItem;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, configuration: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [configuration, setConfiguration] = useState<Record<string, string>>({});

  useEffect(() => {
    setName(installation?.name ?? "");
    setConfiguration(
      Object.fromEntries(
        (plugin?.configurationFields ?? [])
          .filter((field) => field.configurable)
          .map((field) => [field.key, String(installation?.configuration[field.key] ?? "")]),
      ),
    );
  }, [installation, plugin]);

  return (
    <FormModal
      open={!!installation}
      onOpenChange={onOpenChange}
      title="Edit plugin connection"
      submitLabel="Save"
      submitting={submitting}
      onSubmit={async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
          await onSubmit(name.trim(), configuration);
          onOpenChange(false);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="plugin-connection-name">Name</Label>
        <Input
          id="plugin-connection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </div>
      {(plugin?.configurationFields ?? [])
        .filter((field) => field.configurable)
        .map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`plugin-edit-${field.key}`}>{field.label}</Label>
            <Input
              id={`plugin-edit-${field.key}`}
              type={field.sensitive ? "password" : field.key === "email" ? "email" : "text"}
              value={configuration[field.key] ?? ""}
              placeholder={field.sensitive ? "Leave blank to keep the current value" : undefined}
              onChange={(event) =>
                setConfiguration((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
    </FormModal>
  );
}

function ConnectJiraDialog({
  plugin,
  onOpenChange,
  onSubmit,
}: {
  plugin: PluginCatalogItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => setValues({ name: "Jira" }), [plugin]);
  return (
    <FormModal
      open={!!plugin}
      onOpenChange={onOpenChange}
      title="Connect Jira"
      submitLabel="Connect and sync"
      submitting={submitting}
      onSubmit={async () => {
        setSubmitting(true);
        try {
          await onSubmit(values);
          onOpenChange(false);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="jira-name">Connection name</Label>
        <Input id="jira-name" required value={values.name ?? ""} onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))} />
      </div>
      {(plugin?.configurationFields ?? []).filter((field) => field.configurable).map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`jira-${field.key}`}>{field.label}</Label>
          <Input
            id={`jira-${field.key}`}
            required
            type={field.sensitive ? "password" : field.key === "email" ? "email" : field.key === "siteUrl" ? "url" : "text"}
            value={values[field.key] ?? ""}
            onChange={(event) => setValues((v) => ({ ...v, [field.key]: event.target.value }))}
          />
        </div>
      ))}
    </FormModal>
  );
}

type PluginStatus = PluginInstallation["status"] | "AVAILABLE" | "ERROR";

function pluginStatusLabel(status: PluginStatus) {
  const normalized = status.toString().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "CONNECTED") return "Connected";
  if (normalized === "PENDING") return "Pending";
  if (normalized === "AVAILABLE") return "Available";
  if (normalized === "DISABLED") return "Disabled";
  if (normalized === "REVOKED") return "Revoked";
  if (normalized === "ERROR") return "Error";
  return titleCaseProvider(normalized);
}

function pluginStatusClasses(status: PluginStatus) {
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

function PluginStatusBadge({ status }: { status: PluginStatus }) {
  const classes = pluginStatusClasses(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes.shell}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
      {pluginStatusLabel(status)}
    </span>
  );
}

function PluginsTab({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PluginInstallation | null>(null);
  const [connectingJira, setConnectingJira] = useState<PluginCatalogItem | null>(null);
  const availableQ = useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
  const connectedQ = useQuery({
    queryKey: ["organization", organizationId, "plugin-installations"],
    queryFn: () => api.listOrgPluginInstallations(organizationId),
  });
  const installations = connectedQ.data ?? [];
  const plugins = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (availableQ.data ?? []).filter((plugin) => {
      if (!needle) return true;
      const capabilityText = [
        plugin.name,
        plugin.description,
        ...plugin.resourceTypes.flatMap((type) => [type.name, type.key]),
        ...plugin.dataTypes.map((type) => type.key),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return capabilityText.includes(needle);
    });
  }, [availableQ.data, search]);
  const isLoading = availableQ.isLoading || connectedQ.isLoading;
  const error = availableQ.error ?? connectedQ.error;

  const handleGithubSetup = (setupUrl?: string) => {
    if (setupUrl) {
      savePendingGithubSetup(organizationId);
      window.location.assign(setupUrl);
      return;
    }

    toast.message("No setup URL available", {
      description: "This plugin does not provide a setup link yet.",
    });
  };

  const handleConnectPlugin = (plugin: PluginCatalogItem) => {
    if (plugin.id === "jira") setConnectingJira(plugin);
    else handleGithubSetup(plugin.setupUrl);
  };

  const handleSyncPlugin = async (installation: PluginInstallation) => {
    setSyncingId(installation.id);
    try {
      await api.syncPluginInstallation(installation.id);
      toast.success(`${installation.name} synced`);
      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["organization", organizationId, "plugin-installations"],
        }),
        qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] }),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncingId(null);
    }
  };

  const handleUpdatePlugin = async (name: string, configuration: Record<string, unknown>) => {
    if (!editing) return;

    try {
      await api.updatePluginInstallation(editing.id, { name, configuration });
      toast.success("Plugin connection updated");
      await qc.invalidateQueries({
        queryKey: ["organization", organizationId, "plugin-installations"],
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Plugin catalog</h2>
        <p className="text-sm text-muted-foreground">
          Connect external tools and discover the resources and data they provide.
        </p>
      </div>
      <div className="max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Search plugins…" />
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
      ) : plugins.length === 0 ? (
        <EmptyState
          icon={<Plug className="h-4 w-4" />}
          title="No plugins found"
          description="Try a different search or add a plugin to the compiled catalog."
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {plugins.map((plugin) => {
            const connections = installations.filter(
              (installation) => installation.pluginId === plugin.id,
            );
            const status: PluginStatus = connections.some((item) => item.lastSyncError)
              ? "ERROR"
              : connections.some((item) => item.status === "ACTIVE")
                ? "ACTIVE"
                : (connections[0]?.status ?? "AVAILABLE");
            return (
              <Card key={plugin.id} className="overflow-hidden rounded-xl shadow-card">
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                        <Plug className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{plugin.name}</h3>
                          <PluginStatusBadge status={status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Version {plugin.version}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleConnectPlugin(plugin)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      {connections.length ? "Connect another" : "Connect"}
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {plugin.description ?? "No description provided."}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {plugin.resourceTypes.map((type) => (
                      <span
                        key={type.key}
                        className="rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
                      >
                        Resource · {type.name}
                      </span>
                    ))}
                    {plugin.dataTypes.map((type) => (
                      <span
                        key={type.key}
                        className="rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
                      >
                        Data · {titleCaseProvider(type.key.replace(`${plugin.id}.`, ""))}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t bg-muted/20 px-5 py-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Connections</span>
                    <span>{connections.length}</span>
                  </div>
                  {connections.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No connections yet. Connect this plugin to start discovering resources.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border bg-card">
                      {connections.map((installation, index) => (
                        <div
                          key={installation.id}
                          className={`flex items-center gap-3 p-3 ${index ? "border-t" : ""}`}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Plug className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{installation.name}</p>
                              <PluginStatusBadge
                                status={installation.lastSyncError ? "ERROR" : installation.status}
                              />
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              Installation {installation.externalId} ·{" "}
                              {installation.pluginInstallationResources?.length ?? 0} resources
                              {installation.lastSyncedAt
                                ? ` · Synced ${new Date(installation.lastSyncedAt).toLocaleDateString()}`
                                : ""}
                            </p>
                            {installation.lastSyncError && (
                              <p className="mt-1 line-clamp-1 text-xs text-destructive">
                                {installation.lastSyncError}
                              </p>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                aria-label={`${installation.name} actions`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleSyncPlugin(installation)}
                                disabled={syncingId === installation.id}
                              >
                                <RefreshCw
                                  className={`mr-2 h-3.5 w-3.5 ${syncingId === installation.id ? "animate-spin" : ""}`}
                                />
                                Sync
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditing(installation)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <EditPluginInstallationDialog
        installation={editing}
        plugin={(availableQ.data ?? []).find((item) => item.id === editing?.pluginId)}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={handleUpdatePlugin}
      />
      <ConnectJiraDialog
        plugin={connectingJira}
        onOpenChange={(open) => !open && setConnectingJira(null)}
        onSubmit={async (values) => {
          try {
            await api.setupJira(organizationId, values);
            toast.success("Jira connected and synced");
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["plugins"] }),
              qc.invalidateQueries({ queryKey: ["organization", organizationId, "plugin-installations"] }),
              qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] }),
            ]);
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
