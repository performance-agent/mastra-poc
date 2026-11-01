import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useUnsavedDialog } from "./use-unsaved-dialog";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TeamSpaceFields } from "./TeamSpaceDialog";
import { api, errorMessage } from "@/lib/api";
import { DEFAULT_SETUP, type Setup } from "@/lib/experience";
import { useExperience, shortcutUrl } from "@/lib/experience-context";
import { EvaluatorMark } from "./EvaluatorMark";

const STEPS = [
  "Your organization",
  "Your team space",
  "Connect evidence",
  "Choose an evaluator",
  "Your next steps",
];
export function SetupWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { organizationId: org, appearance, profile } = useExperience();
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["setup", profile?.id, org],
    queryFn: () => api.setup(org!),
    enabled: open && !!org,
    refetchOnWindowFocus: true,
  });
  const [draft, setDraft] = useState<Setup>(DEFAULT_SETUP);
  const [workspaceName, setWorkspaceName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    if (saved.data && open) setDraft(saved.data);
  }, [saved.data, open]);
  const workspaces = useQuery({
    queryKey: ["organization", org, "workspaces"],
    queryFn: () => api.listOrgWorkspaces(org!),
    enabled: open && !!org,
  });
  const groups = useQuery({
    queryKey: ["workspace", draft.workspaceId, "groups"],
    queryFn: () => api.listWorkspaceGroups(draft.workspaceId),
    enabled: open && !!draft.workspaceId,
  });
  const resources = useQuery({
    queryKey: ["organization", org, "resources"],
    queryFn: () => api.listOrgResources(org!),
    enabled: open && !!org,
  });
  const assigned = useQuery({
    queryKey: ["group", draft.groupId, "resources"],
    queryFn: () => api.listGroupResources(draft.groupId),
    enabled: open && !!draft.groupId,
  });
  const evaluators = useQuery({
    queryKey: ["group", draft.groupId, "evaluators"],
    queryFn: () => api.listEvaluators(draft.groupId),
    enabled: open && !!draft.groupId,
  });
  const workspaceMembers = useQuery({
    queryKey: ["workspace", draft.workspaceId, "members"],
    queryFn: () => api.listWorkspaceMembers(draft.workspaceId),
    enabled: open && !!draft.workspaceId,
  });
  const groupMembers = useQuery({
    queryKey: ["group", draft.groupId, "members"],
    queryFn: () => api.listGroupMembers(draft.groupId),
    enabled: open && !!draft.groupId,
  });
  const canManageWorkspace =
    appearance.canEdit ||
    workspaceMembers.data?.some(
      (m) => m.userId === profile?.id && (m.role === "OWNER" || m.role === "ADMIN"),
    );
  const canManage =
    canManageWorkspace ||
    groupMembers.data?.some(
      (m) => m.userId === profile?.id && (m.role === "OWNER" || m.role === "ADMIN"),
    );
  const selectedWorkspace = workspaces.data?.find((w) => w.id === draft.workspaceId);
  const selectedGroup = groups.data?.find((g) => g.id === draft.groupId);
  const selectedEvaluator = draft.evaluatorId
    ? evaluators.data?.find((e) => e.id === draft.evaluatorId)
    : undefined;
  const groupUrl =
    org && draft.groupId
      ? shortcutUrl(org, {
          kind: "group",
          id: draft.groupId,
          workspaceId: draft.workspaceId,
          name: "",
        })
      : "";
  const persist = async (next: Setup) => {
    if (!org) return;
    next = { ...next, seen: true };
    await api.saveSetup(org, next);
    setDraft(next);
    qc.setQueryData(["setup", profile?.id, org], next);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const nextAllowed =
    draft.step === 0 ||
    (draft.step === 1 &&
      (creating
        ? !!workspaceName.trim() && !!groupName.trim()
        : !!selectedWorkspace && !!selectedGroup)) ||
    draft.step === 2 ||
    draft.step === 3;
  const loadError =
    saved.error ||
    workspaces.error ||
    groups.error ||
    resources.error ||
    assigned.error ||
    evaluators.error;
  const guard = useUnsavedDialog(
    open,
    !!(workspaceName || groupName || description),
    (next) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      void run(async () => {
        await persist({
          ...draft,
          dismissed: true,
          completed: draft.step === 4 || draft.completed,
        });
        setWorkspaceName("");
        setGroupName("");
        setDescription("");
        onOpenChange(false);
      });
    },
    busy,
  );
  return (
    <>
      <Dialog open={open} onOpenChange={guard.changeOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Make room for your team</DialogTitle>
            <DialogDescription>
              Keep your progress and come back whenever you like.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex gap-2" aria-label="Setup progress">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className="min-w-0 flex-1"
                aria-current={index === draft.step ? "step" : undefined}
              >
                <div
                  className={`mb-2 h-1.5 rounded-full ${index <= draft.step ? "bg-[var(--brand)]" : "bg-muted"}`}
                />
                <span
                  className={`sr-only whitespace-nowrap sm:not-sr-only sm:block sm:text-xs ${index === draft.step ? "font-semibold" : "text-muted-foreground"}`}
                >
                  {["Organization", "Team space", "Evidence", "Evaluator", "Next steps"][index]}
                </span>
              </li>
            ))}
          </ol>
          <div className="space-y-4 py-3">
            {loadError ? (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm">
                Some setup information could not be loaded.{" "}
                <button className="underline" onClick={() => void qc.invalidateQueries()}>
                  Try again
                </button>
              </p>
            ) : null}
            <h3 className="text-xl font-semibold">{STEPS[draft.step]}</h3>
            {draft.step === 0 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Use your existing organization. Add a logo and cover from Personalize whenever you
                  like. Next, choose the workspace and group whose work you want to understand.
                </p>
                <div className="rounded-xl bg-[var(--brand-soft)] p-4 text-sm">
                  Your setup is optional. Existing resources and evaluators will be reused.
                </div>
              </>
            )}
            {draft.step === 1 && (
              <>
                <label className="grid gap-2 text-sm">
                  Workspace
                  <Select
                    value={draft.workspaceId}
                    disabled={busy}
                    onValueChange={(value) =>
                      void run(() =>
                        persist({ ...draft, workspaceId: value, groupId: "", evaluatorId: "" }),
                      )
                    }
                  >
                    <SelectTrigger aria-label="Workspace">
                      <SelectValue placeholder="Choose a workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.data?.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {appearance.canEdit && (
                  <Button variant="outline" onClick={() => setCreating(!creating)}>
                    {creating ? "Use an existing workspace" : "Create a new team space"}
                  </Button>
                )}
                {creating && (
                  <TeamSpaceFields
                    {...{ workspaceName, groupName, description }}
                    onWorkspace={setWorkspaceName}
                    onGroup={setGroupName}
                    onDescription={setDescription}
                  />
                )}
                {!creating && draft.workspaceId && (
                  <>
                    <label className="grid gap-2 text-sm">
                      Group
                      <Select
                        value={draft.groupId}
                        disabled={busy}
                        onValueChange={(value) =>
                          void run(() => persist({ ...draft, groupId: value, evaluatorId: "" }))
                        }
                      >
                        <SelectTrigger aria-label="Group">
                          <SelectValue placeholder="Choose a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.data?.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </>
                )}
              </>
            )}
            {draft.step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Select evidence for this group. Connections open in a separate tab, so your place
                  here is preserved.
                </p>
                {appearance.canEdit && (
                  <a
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-ink)] underline"
                    href={`/organizations/${org}?tab=plugins`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Connect GitHub or Jira
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {!resources.data?.length && (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No resources yet. You can connect a provider later and keep setting up your
                    space.
                  </p>
                )}
                {resources.data?.map((resource) => (
                  <label
                    key={resource.id}
                    className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                  >
                    <Checkbox
                      aria-label={resource.name}
                      disabled={busy || !canManage}
                      checked={assigned.data?.some((r) => r.id === resource.id) ?? false}
                      onCheckedChange={(value) => {
                        const checked = value === true;
                        void run(async () => {
                          if (checked) {
                            if (canManageWorkspace)
                              await api.assignWorkspaceResource(draft.workspaceId, resource.id);
                            await api.assignGroupResource(draft.groupId, resource.id);
                          } else await api.unassignGroupResource(draft.groupId, resource.id);
                          await assigned.refetch();
                        });
                      }}
                    />
                    {resource.name}
                  </label>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void resources.refetch();
                    void assigned.refetch();
                  }}
                >
                  Refresh resources
                </Button>
              </>
            )}
            {draft.step === 3 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose an existing evaluator. Its character, behavior and rules stay exactly as
                  you configured them.
                </p>
                {evaluators.data?.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => persist({ ...draft, evaluatorId: e.id }))}
                    aria-pressed={selectedEvaluator?.id === e.id}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left ${selectedEvaluator?.id === e.id ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "bg-card"}`}
                  >
                    <EvaluatorMark avatar={e.avatar} name={e.name} size={42} />
                    <div>
                      <p className="font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.description || "Ready to review your team's work"}
                      </p>
                    </div>
                    {selectedEvaluator?.id === e.id && <Check className="ml-auto h-4 w-4" />}
                  </button>
                ))}
                <a
                  className="inline-flex items-center gap-2 text-sm underline"
                  href={`${groupUrl}?tab=evaluation`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open evaluator configuration
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Button variant="ghost" size="sm" onClick={() => void evaluators.refetch()}>
                  Refresh evaluators
                </Button>
              </>
            )}
            {draft.step === 4 && (
              <>
                <div className="space-y-3 rounded-2xl border bg-muted/20 p-5">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Workspace</span>
                    <br />
                    <strong>{selectedWorkspace?.name ?? "Choose a workspace"}</strong>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Group</span>
                    <br />
                    <strong>{selectedGroup?.name ?? "Choose a group"}</strong>
                  </p>
                  <p className="text-sm">{assigned.data?.length ?? 0} assigned resources</p>
                  {selectedEvaluator && (
                    <div className="flex items-center gap-3">
                      <EvaluatorMark
                        avatar={selectedEvaluator.avatar}
                        name={selectedEvaluator.name}
                        size={36}
                      />
                      <span>{selectedEvaluator.name}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Starting an evaluation uses the connected evidence and the selected evaluator. You
                  can follow its progress in Reports.
                </p>
                {canManage && selectedGroup && selectedEvaluator && !!assigned.data?.length ? (
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      launched ||
                      !selectedGroup ||
                      !selectedEvaluator ||
                      !assigned.data?.length ||
                      !!loadError
                    }
                    onClick={() =>
                      void run(async () => {
                        const active = await api.listActiveGroupReports(draft.groupId);
                        if (!active.some((j) => j.evaluatorId === selectedEvaluator!.id))
                          await api.startEvaluatorReports(draft.groupId, [selectedEvaluator!.id]);
                        setLaunched(true);
                        await persist({ ...draft, dismissed: true });
                        window.location.assign(`${groupUrl}?tab=reports`);
                      })
                    }
                  >
                    {busy ? "Preparing - " : launched ? "Evaluation started" : "Start evaluation"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <p className="text-sm">
                    Your space is ready. Connect evidence and choose an evaluator whenever you want
                    to start evaluating.
                  </p>
                )}
                <a href={`${groupUrl}?tab=reports`} className="ml-3 text-sm underline">
                  Open reports
                </a>
              </>
            )}
          </div>
          <div className="flex justify-between gap-2 border-t pt-4">
            {draft.step < 4 ? (
              <Button variant="ghost" disabled={busy} onClick={() => guard.changeOpen(false)}>
                Finish later
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {draft.step > 0 && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => persist({ ...draft, step: draft.step - 1 }))}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
              {draft.step === 4 && (
                <Button disabled={busy} onClick={() => guard.changeOpen(false)}>
                  Finish setup
                  <Check className="ml-2 h-4 w-4" />
                </Button>
              )}
              {draft.step < 4 && (
                <Button
                  disabled={busy || !nextAllowed || !!saved.error || saved.isLoading}
                  onClick={() =>
                    void run(async () => {
                      let next = { ...draft };
                      if (draft.step === 1 && creating) {
                        const result = await api.createTeamSpace(org!, {
                          workspaceName,
                          groupName,
                          description,
                        });
                        next = {
                          ...next,
                          workspaceId: result.workspace.id,
                          groupId: result.group.id,
                          evaluatorId: "",
                        };
                        setDraft(next);
                        setCreating(false);
                        setWorkspaceName("");
                        setGroupName("");
                        setDescription("");
                        await workspaces.refetch();
                      }
                      const skipped = new Set(next.skipped ?? []);
                      if (
                        (draft.step === 2 && !assigned.data?.length) ||
                        (draft.step === 3 && !selectedEvaluator)
                      )
                        skipped.add(draft.step);
                      else skipped.delete(draft.step);
                      await persist({
                        ...next,
                        dismissed: false,
                        skipped: [...skipped],
                        step: draft.step + 1,
                      });
                    })
                  }
                >
                  {draft.step === 1 && creating
                    ? "Create and continue"
                    : (draft.step === 2 && !assigned.data?.length) ||
                        (draft.step === 3 && !selectedEvaluator)
                      ? "Set up later"
                      : "Continue"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {guard.confirmation}
    </>
  );
}
