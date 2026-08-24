import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Boxes, Check, Users, FileText, RefreshCw, Sparkles } from "lucide-react";

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
import { InviteMemberDialog } from "@/components/app/InviteMemberDialog";
import { PendingInvitationList } from "@/components/app/PendingInvitationList";
import { SearchInput } from "@/components/app/SearchInput";
import { GroupGithubActivityReportRenderer } from "@/components/app/GroupGithubActivityReportRenderer";
import { GroupGithubHistoryReportRenderer } from "@/components/app/GroupGithubHistoryReportRenderer";
import { EvaluationWorkbench } from "@/components/app/EvaluationWorkbench";
import { GroupReportRenderer } from "@/components/app/GroupReportRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toFormInitial } from "@/lib/form-helpers";
import {
  assignableRoles,
  canManageMemberRoles,
  findCurrentMembership,
  highestRole,
} from "@/lib/membership-role";
import type {
  GroupGithubActivityReport,
  GroupGithubHistoryReport,
  GroupReport,
  PerformanceReport,
  Role,
} from "@/lib/types";

const tabSchema = z.object({
  tab: z.enum(["overview", "members", "resources", "reports", "evaluation"]).optional(),
});
type GroupTab = "overview" | "members" | "resources" | "reports" | "evaluation";

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
  const tab = (search.tab as GroupTab | undefined) ?? "overview";
  const setTab = (v: string) =>
    navigate({ search: { tab: v === "overview" ? undefined : (v as never) } });

  const qc = useQueryClient();
  const { firebaseUser } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [role, setRole] = useState<Role>("VIEWER");
  const [resSearch, setResSearch] = useState("");
  const [pending, setPending] = useState<Record<string, "assign" | "unassign" | undefined>>({});
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [reportStartedAt, setReportStartedAt] = useState<string | null>(null);

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
  const orgMembersQ = useQuery({
    queryKey: ["organization", organizationId, "members"],
    queryFn: () => api.listOrgMembers(organizationId),
  });
  const workspaceMembersQ = useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => api.listWorkspaceMembers(workspaceId),
  });
  const groupResourcesQ = useQuery({
    queryKey: ["group", groupId, "resources"],
    queryFn: () => api.listGroupResources(groupId),
  });
  const orgResourcesQ = useQuery({
    queryKey: ["organization", organizationId, "resources"],
    queryFn: () => api.listOrgResources(organizationId),
  });
  const reportsQ = useQuery({
    queryKey: ["group", groupId, "reports"],
    queryFn: () => api.listGroupReports(groupId),
    refetchInterval: reportStartedAt ? 5000 : false,
  });

  const assignedResourceIds = useMemo(
    () => new Set((groupResourcesQ.data ?? []).map((resource) => resource.id)),
    [groupResourcesQ.data],
  );
  const filteredAssignedResources = useMemo(() => {
    const list = groupResourcesQ.data ?? [];
    const s = resSearch.trim().toLowerCase();
    return s
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(s) ||
            (r.fullName ?? r.githubRepository?.fullName ?? r.externalId ?? "")
              .toLowerCase()
              .includes(s),
        )
      : list;
  }, [groupResourcesQ.data, resSearch]);
  const availableResources = useMemo(() => {
    const list = (orgResourcesQ.data ?? []).filter(
      (resource) => !assignedResourceIds.has(resource.id),
    );
    const s = resSearch.trim().toLowerCase();
    return s
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(s) ||
            (r.fullName ?? r.githubRepository?.fullName ?? r.externalId ?? "")
              .toLowerCase()
              .includes(s),
        )
      : list;
  }, [assignedResourceIds, orgResourcesQ.data, resSearch]);
  const selectedReport = useMemo(() => {
    const reports = reportsQ.data ?? [];
    return reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;
  }, [reportsQ.data, selectedReportId]);

  useEffect(() => {
    if (!reportStartedAt) return;
    const createdReport = (reportsQ.data ?? []).find(
      (report) => report.createdAt && new Date(report.createdAt) >= new Date(reportStartedAt),
    );
    if (createdReport) {
      setSelectedReportId(createdReport.id);
      setReportStartedAt(null);
    }
  }, [reportStartedAt, reportsQ.data]);

  const refreshMembers = () => {
    qc.invalidateQueries({ queryKey: ["group", groupId, "members"] });
    qc.invalidateQueries({ queryKey: ["group", groupId, "invitations"] });
  };
  const identity = { uid: firebaseUser?.uid, email: firebaseUser?.email };
  const members = membersQ.data ?? [];
  const groupMembership = findCurrentMembership(members, identity);
  const workspaceMembership = findCurrentMembership(workspaceMembersQ.data ?? [], identity);
  const organizationMembership = findCurrentMembership(orgMembersQ.data ?? [], identity);
  const actorRole = highestRole([
    groupMembership?.role,
    workspaceMembership?.role,
    organizationMembership?.role,
  ]);
  const currentUserId =
    groupMembership?.userId ?? workspaceMembership?.userId ?? organizationMembership?.userId;
  const canManageRoles = actorRole ? canManageMemberRoles(actorRole) : true;
  const inviteRoles = actorRole ? assignableRoles(actorRole) : undefined;
  const invitationsQ = useQuery({
    queryKey: ["group", groupId, "invitations"],
    queryFn: () => api.listGroupInvitations(groupId),
    enabled: actorRole === "OWNER" || actorRole === "ADMIN",
  });
  const refreshResources = () => {
    qc.invalidateQueries({ queryKey: ["group", groupId, "resources"] });
    qc.invalidateQueries({ queryKey: ["organization", organizationId, "resources"] });
  };

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
      refreshResources();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending((p) => ({ ...p, [resourceId]: undefined }));
    }
  };

  const createReport = async () => {
    setIsCreatingReport(true);
    try {
      await api.createGroupReport(groupId, { type: "GROUP_REPORT" });
      setReportStartedAt(new Date().toISOString());
      toast.success("Report generation started");
      reportsQ.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setIsCreatingReport(false);
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
              { value: "evaluation", label: "Agent evaluation" },
              { value: "members", label: "Members", count: membersQ.data?.length },
              { value: "resources", label: "Resources" },
              { value: "reports", label: "Reports", count: reportsQ.data?.length },
            ]}
          />

          {tab === "overview" && (
            <div className="space-y-6">
              <Card className="flex flex-col gap-3 rounded-xl border-primary/20 bg-primary/5 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Evaluate this group</h2>
                  <p className="text-sm text-muted-foreground">
                    Turn group evidence into an explainable, rule-by-rule report.
                  </p>
                </div>
                <Button onClick={() => setTab("evaluation")}>
                  <Sparkles aria-hidden="true" className="mr-1.5 h-4 w-4" /> Start evaluation
                </Button>
              </Card>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  icon={<Users className="h-4 w-4" />}
                  label="Members"
                  value={membersQ.data?.length ?? 0}
                />
                <StatCard
                  icon={<Boxes className="h-4 w-4" />}
                  label="Assigned resources"
                  value={groupResourcesQ.data?.length ?? 0}
                />
              </div>

              {(groupResourcesQ.data ?? []).length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Assigned resources
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(groupResourcesQ.data ?? []).slice(0, 4).map((resource) => (
                      <ResourceCard key={resource.id} resource={resource} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === "evaluation" && (
            <EvaluationWorkbench workspaceId={workspaceId} groupName={group.name} />
          )}

          {tab === "members" && (
            <div className="space-y-4">
              {canManageRoles && (
                <div className="flex justify-end">
                  <Button onClick={() => setMemberOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Invite member
                  </Button>
                </div>
              )}
              {membersQ.isLoading ? (
                <LoadingState />
              ) : membersQ.error ? (
                <ErrorState
                  message={errorMessage(membersQ.error)}
                  onRetry={() => membersQ.refetch()}
                />
              ) : (
                <MemberList
                  members={members}
                  currentUserId={currentUserId}
                  actorRole={actorRole}
                  onInvite={canManageRoles ? () => setMemberOpen(true) : undefined}
                  onRoleChange={
                    canManageRoles
                      ? async (uid, r) => {
                          try {
                            await api.upsertGroupMember(groupId, uid, r);
                            toast.success("Role updated");
                            refreshMembers();
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }
                      : undefined
                  }
                  onRemove={
                    canManageRoles
                      ? async (uid) => {
                          try {
                            await api.removeGroupMember(groupId, uid);
                            toast.success("Member removed");
                            refreshMembers();
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
                      await api.revokeGroupInvitation(groupId, invitationId);
                      toast.success("Invitation revoked");
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
                  <SearchInput
                    value={resSearch}
                    onChange={setResSearch}
                    placeholder="Search resources…"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Search assigned resources and organization resources available to assign.
                </p>
              </div>
              {groupResourcesQ.isLoading || orgResourcesQ.isLoading ? (
                <LoadingState />
              ) : groupResourcesQ.error || orgResourcesQ.error ? (
                <ErrorState
                  message={errorMessage(groupResourcesQ.error ?? orgResourcesQ.error)}
                  onRetry={() => {
                    groupResourcesQ.refetch();
                    orgResourcesQ.refetch();
                  }}
                />
              ) : (
                <div className="space-y-6">
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground">
                      Assigned resources
                    </h2>
                    {filteredAssignedResources.length === 0 ? (
                      <EmptyState
                        icon={<Boxes className="h-4 w-4" />}
                        title="No assigned resources"
                        description="Assign organization resources to make them available in this group."
                      />
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {filteredAssignedResources.map((r) => (
                          <ResourceCard
                            key={r.id}
                            resource={r}
                            action={
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending[r.id] === "unassign"}
                                onClick={() => toggleResource(r.id, "unassign")}
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
                    <h2 className="text-sm font-semibold text-muted-foreground">
                      Available to assign
                    </h2>
                    {availableResources.length === 0 ? (
                      <EmptyState
                        icon={<Boxes className="h-4 w-4" />}
                        title="No resources available"
                        description="Connect a plugin in the organization to bring in more resources."
                      />
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {availableResources.map((r) => (
                          <ResourceCard
                            key={r.id}
                            resource={r}
                            action={
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending[r.id] === "assign"}
                                onClick={() => toggleResource(r.id, "assign")}
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
          )}

          {tab === "reports" && (
            <ReportsTab
              reports={reportsQ.data ?? []}
              selectedReport={selectedReport}
              selectedReportId={selectedReportId}
              isLoading={reportsQ.isLoading}
              error={reportsQ.error}
              isCreating={isCreatingReport}
              isWaitingForReport={Boolean(reportStartedAt)}
              onCreate={createReport}
              onRefresh={() => reportsQ.refetch()}
              onSelect={setSelectedReportId}
            />
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

      <InviteMemberDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        role={role}
        setRole={setRole}
        allowedRoles={inviteRoles}
        onInvite={async (email, invitedRole) => {
          const invitation = await api.createGroupInvitation(groupId, email, invitedRole);
          refreshMembers();
          return invitation;
        }}
      />
    </AppShell>
  );
}

function ReportsTab({
  reports,
  selectedReport,
  selectedReportId,
  isLoading,
  error,
  isCreating,
  isWaitingForReport,
  onCreate,
  onRefresh,
  onSelect,
}: {
  reports: Array<
    PerformanceReport<GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport>
  >;
  selectedReport: PerformanceReport<
    GroupReport | GroupGithubActivityReport | GroupGithubHistoryReport
  > | null;
  selectedReportId: string | null;
  isLoading: boolean;
  error: unknown;
  isCreating: boolean;
  isWaitingForReport: boolean;
  onCreate: () => Promise<void>;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-muted-foreground">Group reports</h2>
          <p className="mt-1 max-w-2xl break-words text-xs text-muted-foreground">
            Generate a full historical report from all plugin resources assigned to this group.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <Button className="w-full sm:w-auto" variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button className="w-full sm:w-auto" onClick={onCreate} disabled={isCreating}>
            <FileText className="mr-1.5 h-4 w-4" />
            {isCreating ? "Starting..." : "Group report"}
          </Button>
        </div>
      </div>

      {isWaitingForReport && (
        <Card className="rounded-xl p-4 shadow-card">
          <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="min-w-0 break-words">
              Report generation started. Refreshing until the new report is available.
            </span>
          </div>
        </Card>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={onRefresh} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-4 w-4" />}
          title="No reports yet"
          description="Generate a historical report to analyze the group's delivery signals."
          actionLabel="Generate group report"
          onAction={onCreate}
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <Card className="h-fit min-w-0 overflow-hidden rounded-xl p-2 shadow-card">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => onSelect(report.id)}
                  className={`w-56 shrink-0 rounded-lg px-3 py-2 text-left transition-colors lg:w-full ${
                    (selectedReportId ?? reports[0]?.id) === report.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <div className="truncate text-sm font-medium">
                    {report.type === "GROUP_REPORT"
                      ? "Group report"
                      : report.type === "GITHUB_HISTORY"
                        ? "GitHub history"
                        : "GitHub activity"}
                  </div>
                  <div className="truncate text-[11px]">
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString()
                      : "Generated report"}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {selectedReport ? (
            <div className="min-w-0 overflow-hidden">
              {selectedReport.type === "GROUP_REPORT" ? (
                <GroupReportRenderer report={selectedReport as PerformanceReport<GroupReport>} />
              ) : selectedReport.type === "GITHUB_HISTORY" ? (
                <GroupGithubHistoryReportRenderer
                  report={selectedReport as PerformanceReport<GroupGithubHistoryReport>}
                />
              ) : (
                <GroupGithubActivityReportRenderer
                  report={selectedReport as PerformanceReport<GroupGithubActivityReport>}
                />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
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
