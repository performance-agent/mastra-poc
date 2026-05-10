import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Boxes, Check } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { EntityHeader } from "@/components/app/EntityHeader";
import { ContextTabs } from "@/components/app/ContextTabs";
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
import type { Role } from "@/lib/types";

const tabSchema = z.object({
  tab: z.enum(["overview", "members", "resources"]).optional(),
});

export const Route = createFileRoute(
  "/organizations/$organizationId/workspaces/$workspaceId/groups/$groupId",
)({
  validateSearch: tabSchema,
  head: () => ({
    meta: [
      { title: "Group — Performance Agent" },
      { name: "description", content: "Manage group members and resource assignments." },
    ],
  }),
  component: GroupPage,
});

function GroupPage() {
  const { organizationId, workspaceId, groupId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? "overview";
  const setTab = (v: string) =>
    navigate({ search: { tab: v === "overview" ? undefined : (v as never) } });

  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<Role>("VIEWER");
  const [resSearch, setResSearch] = useState("");
  const [pending, setPending] = useState<Record<string, "assign" | "unassign" | undefined>>({});

  const orgQ = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId),
  });
  const wsQ = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
  });
  const groupQ = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.getGroup(groupId),
  });
  const membersQ = useQuery({
    queryKey: ["group", groupId, "members"],
    queryFn: () => api.listGroupMembers(groupId),
  });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const resQ = useQuery({
    queryKey: ["organization", organizationId, "resources"],
    queryFn: () => api.listOrgResources(organizationId),
  });

  const filteredRes = useMemo(() => {
    const list = resQ.data ?? [];
    const s = resSearch.trim().toLowerCase();
    return s ? list.filter((r) => r.name.toLowerCase().includes(s)) : list;
  }, [resQ.data, resSearch]);

  const refreshMembers = () => qc.invalidateQueries({ queryKey: ["group", groupId, "members"] });

  const toggleResource = async (resourceId: string, action: "assign" | "unassign") => {
    setPending((p) => ({ ...p, [resourceId]: action }));
    try {
      if (action === "assign") {
        await api.assignGroupResource(groupId, resourceId);
        toast.success("Resource assigned");
      } else {
        await api.unassignGroupResource(groupId, resourceId);
        toast.success("Resource unassigned");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending((p) => ({ ...p, [resourceId]: undefined }));
    }
  };

  const group = groupQ.data;

  return (
    <AppShell>
      {groupQ.isLoading ? (
        <LoadingState />
      ) : groupQ.error || !group ? (
        <ErrorState message={errorMessage(groupQ.error)} onRetry={() => groupQ.refetch()} />
      ) : (
        <div className="space-y-6">
          <Breadcrumbs
            items={[
              { label: "Organizations", to: "/organizations" },
              { label: orgQ.data?.name ?? "Organization", to: `/organizations/${organizationId}` },
              {
                label: wsQ.data?.name ?? "Workspace",
                to: `/organizations/${organizationId}/workspaces/${workspaceId}`,
              },
              { label: group.name },
            ]}
          />
          <EntityHeader
            name={group.name}
            description={group.description}
            photoUrl={group.photoUrl}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <ContextTabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "overview", label: "Overview" },
              { value: "members", label: "Members", count: membersQ.data?.length },
              { value: "resources", label: "Resources" },
            ]}
          />

          {tab === "overview" && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              {membersQ.data?.length ?? 0} members in this group.
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setMemberOpen(true)}>
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
                  onInvite={() => setMemberOpen(true)}
                  onRoleChange={async (uid, r) => {
                    try {
                      await api.upsertGroupMember(groupId, uid, r);
                      toast.success("Role updated");
                      refreshMembers();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                  onRemove={async (uid) => {
                    try {
                      await api.removeGroupMember(groupId, uid);
                      toast.success("Member removed");
                      refreshMembers();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                />
              )}
            </div>
          )}

          {tab === "resources" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:w-72">
                  <SearchInput value={resSearch} onChange={setResSearch} placeholder="Search resources…" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Assign organization resources to this group.
                </p>
              </div>
              {resQ.isLoading ? (
                <LoadingState />
              ) : resQ.error ? (
                <ErrorState message={errorMessage(resQ.error)} onRetry={() => resQ.refetch()} />
              ) : filteredRes.length === 0 ? (
                <EmptyState
                  icon={<Boxes className="h-4 w-4" />}
                  title="No resources to assign"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRes.map((r) => (
                    <ResourceCard
                      key={r.id}
                      resource={r}
                      action={
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending[r.id] === "assign"}
                            onClick={() => toggleResource(r.id, "assign")}
                          >
                            <Check className="mr-1 h-3 w-3" /> Assign
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending[r.id] === "unassign"}
                            onClick={() => toggleResource(r.id, "unassign")}
                          >
                            Unassign
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit group"
        initial={toFormInitial(group)}
        onSubmit={async (v) => {
          try {
            await api.updateGroup(groupId, v);
            toast.success("Group updated");
            qc.invalidateQueries({ queryKey: ["group", groupId] });
            qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "groups"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${group?.name}?`}
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.deleteGroup(groupId);
            toast.success("Group deleted");
            qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "groups"] });
            navigate({
              to: "/organizations/$organizationId/workspaces/$workspaceId",
              params: { organizationId, workspaceId },
            });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
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
            <Button variant="outline" onClick={() => setMemberOpen(false)}>Cancel</Button>
            <Button
              disabled={!userId}
              onClick={async () => {
                if (!userId) return;
                try {
                  await api.upsertGroupMember(groupId, userId, role);
                  toast.success("Member added");
                  setMemberOpen(false);
                  setUserId(undefined);
                  setRole("VIEWER");
                  refreshMembers();
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
    </AppShell>
  );
}
