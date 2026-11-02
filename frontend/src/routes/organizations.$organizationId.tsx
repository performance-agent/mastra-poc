import { PluginConfigurationFields } from "@/components/app/PluginConfigurationFields";
import { McpSetup } from "@/components/app/McpSetup";
import { PluginMark } from "@/components/app/PluginMark";
import { TeamSpaceDialog } from "@/components/app/TeamSpaceDialog";
import { OrganizationHome } from "@/components/app/OrganizationHome";
import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  FolderTree,
  Boxes,
  Plug,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Database,
  Info,
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
import { InviteMemberDialog } from "@/components/app/InviteMemberDialog";
import { PendingInvitationList } from "@/components/app/PendingInvitationList";
import { SearchInput } from "@/components/app/SearchInput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toFormInitial } from "@/lib/form-helpers";
import { savePendingGithubSetup } from "@/lib/github-setup";
import {
  assignableRoles,
  canManageMemberRoles,
  findCurrentMembership,
} from "@/lib/membership-role";
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
              { value: "overview", label: "Home" },
              { value: "workspaces", label: "Workspaces", count: workspacesQ.data?.length },
              { value: "members", label: "Members", count: membersQ.data?.length },
              { value: "resources", label: "Resources", count: resourcesQ.data?.length },
              { value: "plugins", label: "Plugins" },
              { value: "data-types", label: "Data Types", count: dataTypesQ.data?.length },
            ]}
          />

          {tab === "overview" && <OrganizationHome />}
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

      <TeamSpaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
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
  const { firebaseUser } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [role, setRole] = useState<Role>("VIEWER");
  const membersQ = useQuery({
    queryKey: ["organization", organizationId, "members"],
    queryFn: () => api.listOrgMembers(organizationId),
  });
  const members = membersQ.data ?? [];
  const currentMembership = findCurrentMembership(members, {
    uid: firebaseUser?.uid,
    email: firebaseUser?.email,
  });
  const actorRole = currentMembership?.role;
  const invitationsQ = useQuery({
    queryKey: ["organization", organizationId, "invitations"],
    queryFn: () => api.listOrgInvitations(organizationId),
    enabled: actorRole === "OWNER" || actorRole === "ADMIN",
  });
  const canManageRoles = actorRole ? canManageMemberRoles(actorRole) : true;
  const inviteRoles = actorRole ? assignableRoles(actorRole) : undefined;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "members"] });
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "invitations"] });
  };

  return (
    <div className="space-y-4">
      {canManageRoles && (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Invite member
          </Button>
        </div>
      )}
      {membersQ.isLoading ? (
        <LoadingState />
      ) : membersQ.error ? (
        <ErrorState message={errorMessage(membersQ.error)} onRetry={() => membersQ.refetch()} />
      ) : (
        <MemberList
          members={members}
          currentUserId={currentMembership?.userId}
          actorRole={actorRole}
          onInvite={canManageRoles ? () => setAddOpen(true) : undefined}
          onRoleChange={
            canManageRoles
              ? async (uid, r) => {
                  try {
                    await api.upsertOrgMember(organizationId, uid, r);
                    toast.success("Role updated");
                    refresh();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }
              : undefined
          }
          onRemove={
            actorRole === "OWNER" || !actorRole
              ? async (uid) => {
                  try {
                    await api.removeOrgMember(organizationId, uid);
                    toast.success("Member removed");
                    refresh();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }
              : undefined
          }
        />
      )}
      {canManageRoles && (
        <PendingInvitationList
          invitations={invitationsQ.data ?? []}
          onRevoke={async (invitationId) => {
            try {
              await api.revokeOrgInvitation(organizationId, invitationId);
              toast.success("Invitation revoked");
              refresh();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      )}

      <InviteMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        role={role}
        setRole={setRole}
        allowedRoles={inviteRoles}
        onInvite={async (email, invitedRole) => {
          const invitation = await api.createOrgInvitation(organizationId, email, invitedRole);
          refresh();
          return invitation;
        }}
      />
    </div>
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
      dirty={
        name !== (installation?.name ?? "") ||
        Object.entries(configuration).some(
          ([key, value]) => value !== String(installation?.configuration[key] ?? ""),
        )
      }
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
      {plugin && (
        <PluginConfigurationFields
          plugin={plugin}
          values={configuration}
          editing
          prefix="plugin-edit"
          onChange={(key, value) => setConfiguration((current) => ({ ...current, [key]: value }))}
        />
      )}{" "}
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
      dirty={JSON.stringify(values) !== JSON.stringify({ name: "Jira" })}
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
        <Input
          id="jira-name"
          required
          value={values.name ?? ""}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
      </div>
      {plugin && (
        <PluginConfigurationFields
          plugin={plugin}
          values={values}
          prefix="jira"
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        />
      )}{" "}
    </FormModal>
  );
}

type PluginStatus = PluginInstallation["status"] | "AVAILABLE" | "ERROR";

function pluginStatusLabel(status: PluginStatus) {
  const normalized = status.toString().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "CONNECTED") return "Connected";
  if (normalized === "PENDING") return "Pending";
  if (normalized === "AVAILABLE") return "Not connected";
  if (normalized === "DISABLED") return "Disabled";
  if (normalized === "REVOKED") return "Revoked";
  if (normalized === "ERROR") return "Error";
  return titleCaseProvider(normalized);
}

function pluginStatusClasses(status: PluginStatus) {
  const normalized = status.toString().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "CONNECTED") {
    return {
      shell: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
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
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes.shell}`}
    >
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
  const [configuringMcp, setConfiguringMcp] = useState(false);
  const [managing, setManaging] = useState<PluginCatalogItem | null>(null);
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

  if (configuringMcp)
    return (
      <div className="space-y-5">
        <Button variant="ghost" onClick={() => setConfiguringMcp(false)}>
          ← Plugins
        </Button>
        <McpSetup />
      </div>
    );

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Plugins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your sources. Bring your assistant.
        </p>
      </div>
      <div className="max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Search plugins" />
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
        <div className="space-y-7">
          {plugins.some((p) => p.configurationKind !== "mcp") && (
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Data sources</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Bring evidence into your workspace.
              </p>
            </div>
          )}
          <div className="grid items-stretch gap-5 md:grid-cols-2">
            {plugins
              .filter((p) => p.configurationKind !== "mcp")
              .map((plugin) => {
                const connections = installations.filter(
                  (installation) => installation.pluginId === plugin.id,
                );
                const status: PluginStatus = connections.some((item) => item.lastSyncError)
                  ? "ERROR"
                  : connections.some((item) => item.status === "ACTIVE")
                    ? "ACTIVE"
                    : (connections[0]?.status ?? "AVAILABLE");
                return (
                  <Card
                    key={plugin.id}
                    role="region"
                    aria-label={`${plugin.name} plugin`}
                    className="flex min-h-44 rounded-2xl p-5 shadow-none sm:p-6"
                  >
                    <div className="flex w-full items-start gap-5">
                      <PluginMark pluginId={plugin.id} className="mt-0.5 size-11 sm:size-12" />
                      <div className="flex min-w-0 flex-1 flex-col self-stretch">
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="text-lg font-semibold tracking-tight">{plugin.name}</h4>
                          <PluginStatusBadge status={status} />
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {plugin.id === "github"
                            ? "Repositories, pull requests, reviews and issues."
                            : plugin.id === "jira"
                              ? "Projects, issues and delivery context."
                              : plugin.description}
                        </p>
                        {connections.length > 0 && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {connections.length}{" "}
                            {connections.length === 1 ? "connection" : "connections"} ·{" "}
                            {connections.reduce(
                              (total, item) =>
                                total + (item.pluginInstallationResources?.length ?? 0),
                              0,
                            )}{" "}
                            resources
                          </p>
                        )}
                        <div className="mt-auto pt-4">
                          <Button
                            variant={connections.length ? "outline" : "default"}
                            className={connections.length ? "bg-card shadow-none" : ""}
                            onClick={() =>
                              connections.length ? setManaging(plugin) : handleConnectPlugin(plugin)
                            }
                          >
                            {connections.length
                              ? `Manage ${connections.length === 1 ? "connection" : "connections"}`
                              : `Connect ${plugin.name}`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
          {plugins
            .filter((p) => p.configurationKind === "mcp")
            .map((plugin) => (
              <section key={plugin.id} className="space-y-3">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">AI assistants</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use your own assistant to analyze connected evidence.
                  </p>
                </div>
                <Card className="rounded-2xl p-5 shadow-none sm:p-6">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div className="flex gap-4">
                      <PluginMark pluginId="mcp" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold tracking-tight">{plugin.name}</h4>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Optional
                          </span>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                          Analyze and save reports from your preferred assistant, using your
                          workspace evaluators.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          ChatGPT · Claude · Cursor · VS Code · Local agents
                        </p>
                      </div>
                    </div>
                    <Button
                      className="shrink-0 sm:min-w-40"
                      onClick={() => setConfiguringMcp(true)}
                    >
                      Configure MCP
                    </Button>
                  </div>
                </Card>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0" />
                  Uses the same group permissions as the platform.
                </p>
              </section>
            ))}
        </div>
      )}
      <Sheet
        open={!!managing}
        onOpenChange={(open) => {
          if (!open) setManaging(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {managing && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pr-6">
                <PluginMark pluginId={managing.id} className="size-10" />
                <div>
                  <SheetTitle>{managing.name} connections</SheetTitle>
                  <SheetDescription>
                    Manage the connections that provide your evidence.
                  </SheetDescription>
                </div>
              </div>
              <Button variant="outline" onClick={() => handleConnectPlugin(managing)}>
                <Plus className="size-4" />
                Connect another {managing.name}
              </Button>
              <div className="space-y-4">
                {installations
                  .filter((item) => item.pluginId === managing.id)
                  .map((installation) => (
                    <article
                      key={installation.id}
                      className="space-y-4 rounded-xl border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">{installation.name}</h3>
                        <PluginStatusBadge
                          status={installation.lastSyncError ? "ERROR" : installation.status}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {installation.pluginInstallationResources?.length ?? 0} resources
                        {installation.lastSyncedAt
                          ? ` · Synced ${new Date(installation.lastSyncedAt).toLocaleDateString()}`
                          : ""}
                      </p>
                      {installation.lastSyncError && (
                        <p className="text-sm text-destructive">{installation.lastSyncError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={syncingId === installation.id}
                          onClick={() => handleSyncPlugin(installation)}
                        >
                          <RefreshCw
                            className={`size-3.5 ${syncingId === installation.id ? "animate-spin" : ""}`}
                          />
                          {syncingId === installation.id ? "Syncing…" : "Sync"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(installation)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
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
              qc.invalidateQueries({
                queryKey: ["organization", organizationId, "plugin-installations"],
              }),
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
