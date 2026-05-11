import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Users, Layers, Boxes, Check } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { api, errorMessage } from "@/lib/api";
import { toFormInitial } from "@/lib/form-helpers";
import type { Group, Role } from "@/lib/types";

const tabSchema = z.object({
  tab: z.string().optional(),
});
const workspaceTabs = ["overview", "groups", "members", "resources"] as const;
type WorkspaceTab = (typeof workspaceTabs)[number];

export const Route = createFileRoute(
  "/organizations/$organizationId/workspaces/$workspaceId",
)({
  validateSearch: tabSchema,
  head: () => ({
    meta: [
      { title: "Workspace — Performance Agent" },
      { name: "description", content: "Manage groups, members, and resources for this workspace." },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { organizationId, workspaceId } = Route.useParams();
  const isNestedRoute = useRouterState({
    select: (state) =>
      state.location.pathname.replace(/\/$/, "") !==
      `/organizations/${organizationId}/workspaces/${workspaceId}`,
  });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = workspaceTabs.includes(search.tab as WorkspaceTab)
    ? (search.tab as WorkspaceTab)
    : "overview";
  const setTab = (v: string) =>
    navigate({ search: { tab: v === "overview" ? undefined : (v as never) } });

  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const orgQ = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId),
  });
  const wsQ = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
  });
  const groupsQ = useQuery({
    queryKey: ["workspace", workspaceId, "groups"],
    queryFn: () => api.listWorkspaceGroups(workspaceId),
  });
  const membersQ = useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => api.listWorkspaceMembers(workspaceId),
  });
  const resourcesQ = useQuery({
    queryKey: ["workspace", workspaceId, "resources"],
    queryFn: () => api.listWorkspaceResources(workspaceId),
  });

  const ws = wsQ.data;
  const org = orgQ.data;

  if (isNestedRoute) {
    return <Outlet />;
  }

  return (
    <AppShell>
      {wsQ.isLoading ? (
        <LoadingState />
      ) : wsQ.error || !ws ? (
        <ErrorState message={errorMessage(wsQ.error)} onRetry={() => wsQ.refetch()} />
      ) : (
        <div className="space-y-6">
          <Breadcrumbs
            items={[
              { label: "Organizations", to: "/organizations" },
              { label: org?.name ?? "Organization", to: `/organizations/${organizationId}` },
              { label: ws.name },
            ]}
          />
          <EntityHeader
            name={ws.name}
            description={ws.description}
            photoUrl={ws.photoUrl}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <ContextTabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "overview", label: "Overview" },
              { value: "groups", label: "Groups", count: groupsQ.data?.length },
              { value: "members", label: "Members", count: membersQ.data?.length },
              { value: "resources", label: "Resources" },
            ]}
          />

          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard icon={<Layers className="h-4 w-4" />} label="Groups" value={groupsQ.data?.length ?? 0} />
                <StatCard icon={<Users className="h-4 w-4" />} label="Members" value={membersQ.data?.length ?? 0} />
                <StatCard icon={<Boxes className="h-4 w-4" />} label="Assigned resources" value={resourcesQ.data?.length ?? 0} />
              </div>

              {(resourcesQ.data ?? []).length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Assigned resources
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(resourcesQ.data ?? []).slice(0, 4).map((resource) => (
                      <ResourceCard key={resource.id} resource={resource} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          {tab === "groups" && (
            <GroupsTab organizationId={organizationId} workspaceId={workspaceId} />
          )}
          {tab === "members" && (
            <WorkspaceMembersTab workspaceId={workspaceId} />
          )}
          {tab === "resources" && (
            <WorkspaceResourcesTab organizationId={organizationId} workspaceId={workspaceId} />
          )}
        </div>
      )}

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit workspace"
        initial={toFormInitial(ws)}
        onSubmit={async (v) => {
          try {
            await api.updateWorkspace(workspaceId, v);
            toast.success("Workspace updated");
            qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
            qc.invalidateQueries({ queryKey: ["organization", organizationId, "workspaces"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${ws?.name}?`}
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.deleteWorkspace(workspaceId);
            toast.success("Workspace deleted");
            qc.invalidateQueries({ queryKey: ["organization", organizationId, "workspaces"] });
            navigate({ to: "/organizations/$organizationId", params: { organizationId } });
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

function GroupsTab({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const q = useQuery({
    queryKey: ["workspace", workspaceId, "groups"],
    queryFn: () => api.listWorkspaceGroups(workspaceId),
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "groups"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New group
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Layers className="h-4 w-4" />}
          title="No groups yet"
          description="Groups let you organize members and resource assignments."
          actionLabel="New group"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((g) => (
            <EntityCard
              key={g.id}
              name={g.name}
              description={g.description}
              photoUrl={g.photoUrl}
              to="/organizations/$organizationId/workspaces/$workspaceId/groups/$groupId"
              params={{ organizationId, workspaceId, groupId: g.id }}
              onEdit={() => setEditing(g)}
              onDelete={() => setDeleting(g)}
            />
          ))}
        </div>
      )}
      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New group"
        submitLabel="Create"
        onSubmit={async (v) => {
          try {
            await api.createGroup(workspaceId, v);
            toast.success("Group created");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <EntityFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Edit group"
        initial={toFormInitial(editing)}
        onSubmit={async (v) => {
          if (!editing) return;
          try {
            await api.updateGroup(editing.id, v);
            toast.success("Group updated");
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
            await api.deleteGroup(deleting.id);
            toast.success("Group deleted");
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

function WorkspaceMembersTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const membersQ = useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => api.listWorkspaceMembers(workspaceId),
  });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<Role>("VIEWER");
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
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
          onInvite={() => setOpen(true)}
          onRoleChange={async (uid, r) => {
            try {
              await api.upsertWorkspaceMember(workspaceId, uid, r);
              toast.success("Role updated");
              refresh();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
          onRemove={async (uid) => {
            try {
              await api.removeWorkspaceMember(workspaceId, uid);
              toast.success("Member removed");
              refresh();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>User</Label>
              <UserPicker
                users={usersQ.data ?? []}
                value={userId}
                onChange={setUserId}
                excludeIds={(membersQ.data ?? []).map((m) => m.userId)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <RoleSelect value={role} onChange={setRole} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!userId}
              onClick={async () => {
                if (!userId) return;
                try {
                  await api.upsertWorkspaceMember(workspaceId, userId, role);
                  toast.success("Member added");
                  setOpen(false);
                  setUserId(undefined);
                  setRole("VIEWER");
                  refresh();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkspaceResourcesTab({
  organizationId,
  workspaceId,
}: {
  organizationId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Record<string, "assign" | "unassign" | undefined>>({});
  const assignedQ = useQuery({
    queryKey: ["workspace", workspaceId, "resources"],
    queryFn: () => api.listWorkspaceResources(workspaceId),
  });
  const orgResourcesQ = useQuery({
    queryKey: ["organization", organizationId, "resources"],
    queryFn: () => api.listOrgResources(organizationId),
  });
  const assignedIds = useMemo(
    () => new Set((assignedQ.data ?? []).map((resource) => resource.id)),
    [assignedQ.data],
  );
  const filteredAssigned = useMemo(() => {
    const list = assignedQ.data ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(s) ||
            (r.fullName ?? r.githubRepository?.fullName ?? "").toLowerCase().includes(s),
        )
      : list;
  }, [assignedQ.data, search]);
  const availableToAssign = useMemo(() => {
    const list = (orgResourcesQ.data ?? []).filter((resource) => !assignedIds.has(resource.id));
    const s = search.trim().toLowerCase();
    return s
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(s) ||
            (r.fullName ?? r.githubRepository?.fullName ?? "").toLowerCase().includes(s),
        )
      : list;
  }, [assignedIds, orgResourcesQ.data, search]);

  const refreshResources = () => {
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "resources"] });
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] });
  };

  const toggle = async (resourceId: string, action: "assign" | "unassign") => {
    setPending((p) => ({ ...p, [resourceId]: action }));
    try {
      if (action === "assign") {
        await api.assignWorkspaceResource(workspaceId, resourceId);
        toast.success("Resource assigned");
      } else {
        await api.unassignWorkspaceResource(workspaceId, resourceId);
        toast.success("Resource unassigned");
      }
      refreshResources();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending((p) => ({ ...p, [resourceId]: undefined }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search resources…" />
        </div>
        <p className="text-xs text-muted-foreground">
          Search assigned resources and organization resources available to assign.
        </p>
      </div>
      {assignedQ.isLoading || orgResourcesQ.isLoading ? (
        <LoadingState />
      ) : assignedQ.error || orgResourcesQ.error ? (
        <ErrorState
          message={errorMessage(assignedQ.error ?? orgResourcesQ.error)}
          onRetry={() => {
            assignedQ.refetch();
            orgResourcesQ.refetch();
          }}
        />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Assigned resources</h2>
            {filteredAssigned.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-4 w-4" />}
                title="No assigned resources"
                description="Assign organization resources to make them available in this workspace."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredAssigned.map((r) => (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending[r.id] === "unassign"}
                        onClick={() => toggle(r.id, "unassign")}
                      >
                        Unassign
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Available to assign</h2>
            {availableToAssign.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-4 w-4" />}
                title="No resources available"
                description="Connect an integration in the organization to bring in more resources."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {availableToAssign.map((r) => (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending[r.id] === "assign"}
                        onClick={() => toggle(r.id, "assign")}
                      >
                        <Check className="mr-1 h-3 w-3" /> Assign
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
