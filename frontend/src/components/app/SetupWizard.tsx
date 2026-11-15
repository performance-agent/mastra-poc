import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock3, Loader2, Plug, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { invalidateEvaluatorQueries } from "@/lib/evaluators";
import { SETUP_STEPS, setupUrl, type SetupStep } from "@/lib/experience";
import { useExperience, shortcutUrl } from "@/lib/experience-context";
import { setupPeriod } from "@/lib/setup";
import { useSetupDraft } from "./use-setup-draft";
import { SetupPlugins } from "./SetupPlugins";
import { SetupEvaluator } from "./SetupEvaluator";
import { SetupTeam, SetupReview } from "./SetupTeam";
import { ConfirmDialog } from "./ConfirmDialog";
import isotipo from "@/assets/brand/isotipo.svg";

const LABELS = {
  team: "Your team",
  plugins: "Connect plugins",
  evaluator: "Your evaluator",
  review: "Review & start",
  welcome: "Welcome",
};
const TITLES = {
  team: "Give your team a home",
  plugins: "Connect your tools",
  evaluator: "Choose your evaluator",
  review: "Ready for your first evaluation",
  welcome: "Welcome",
};
const DESCRIPTIONS = {
  team: "Start small. You can organize more teams later.",
  plugins: "Choose your evidence sources and set up your assistant.",
  evaluator: "Start with an evaluator, then make it yours.",
  review: "Check the details before you start.",
  welcome: "",
};

export function SetupPage({
  organizationId: org,
  routeStep,
}: {
  organizationId: string;
  routeStep: string;
}) {
  const { profile, appearance, ready: experienceReady, error: experienceError } = useExperience();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [credentialsDirty, setCredentialsDirty] = useState(false);
  const state = useSetupDraft(org, profile?.id, credentialsDirty);
  const { draft, latest, ready, change, flush } = state;
  const [busy, setBusy] = useState(false);
  const [pluginBusy, setPluginBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const step = SETUP_STEPS.includes(routeStep as SetupStep) ? (routeStep as SetupStep) : draft.step;
  const index = SETUP_STEPS.indexOf(step);
  const organizations = useQuery({ queryKey: ["organizations"], queryFn: api.listOrganizations });
  const workspaces = useQuery({
    queryKey: ["organization", org, "workspaces"],
    queryFn: () => api.listOrgWorkspaces(org),
  });
  const groups = useQuery({
    queryKey: ["workspace", draft.workspaceId, "groups"],
    queryFn: () => api.listWorkspaceGroups(draft.workspaceId),
    enabled: !!draft.workspaceId,
  });
  const resources = useQuery({
    queryKey: ["organization", org, "resources"],
    queryFn: () => api.listOrgResources(org),
    refetchInterval: step === "plugins" ? 3000 : false,
  });
  const assigned = useQuery({
    queryKey: ["group", draft.groupId, "resources"],
    queryFn: () => api.listGroupResources(draft.groupId),
    enabled: !!draft.groupId,
  });
  const evaluators = useQuery({
    queryKey: ["group", draft.groupId, "evaluators"],
    queryFn: () => api.listEvaluators(draft.groupId),
    enabled: !!draft.groupId,
  });
  const voices = useQuery({
    queryKey: ["group", draft.groupId, "personalities"],
    queryFn: () => api.listPersonalities(draft.groupId),
    enabled: !!draft.groupId,
  });
  const memberships = useQuery({
    queryKey: ["workspace", draft.workspaceId, "members"],
    queryFn: () => api.listWorkspaceMembers(draft.workspaceId),
    enabled: !!draft.workspaceId,
  });
  const groupMemberships = useQuery({
    queryKey: ["group", draft.groupId, "members"],
    queryFn: () => api.listGroupMembers(draft.groupId),
    enabled: !!draft.groupId,
  });
  const canManageWorkspace =
    !!appearance.canEdit ||
    !!memberships.data?.some(
      (member) => member.userId === profile?.id && ["OWNER", "ADMIN"].includes(member.role),
    );
  const canManage =
    canManageWorkspace ||
    !!groupMemberships.data?.some(
      (member) => member.userId === profile?.id && ["OWNER", "ADMIN"].includes(member.role),
    );
  const workspace = workspaces.data?.find((item) => item.id === draft.workspaceId);
  const group = groups.data?.find((item) => item.id === draft.groupId);
  const evaluator = evaluators.data?.find((item) => item.id === draft.evaluatorId);
  const organization = organizations.data?.find((item) => item.id === org);
  const activeResources =
    resources.data?.filter(
      (item) =>
        item.active !== false &&
        (!item.pluginInstallation || item.pluginInstallation.status === "ACTIVE"),
    ) ?? [];
  const selectedResources = activeResources.filter((item) => draft.resourceIds.includes(item.id));
  const taskLoading =
    step === "team"
      ? workspaces.isLoading || groups.isLoading
      : step === "plugins"
        ? resources.isLoading || assigned.isLoading
        : step === "evaluator"
          ? evaluators.isLoading || voices.isLoading
          : step === "review"
            ? resources.isLoading || assigned.isLoading || evaluators.isLoading
            : false;
  const taskError =
    experienceError ||
    organizations.error ||
    (step === "team"
      ? workspaces.error || groups.error
      : step === "plugins"
        ? resources.error || assigned.error
        : step === "evaluator"
          ? evaluators.error || voices.error
          : step === "review"
            ? resources.error || assigned.error || evaluators.error
            : null);
  const go = (next: SetupStep) => {
    void navigate({ to: setupUrl(org, next) } as never);
  };
  useEffect(() => {
    if (!ready) return;
    if (!SETUP_STEPS.includes(routeStep as SetupStep)) {
      void navigate({ to: setupUrl(org, latest.current.step), replace: true } as never);
      return;
    }
    if (index > 1 && (!draft.workspaceId || !draft.groupId)) {
      void navigate({ to: setupUrl(org, "team"), replace: true } as never);
      return;
    }
    if (latest.current.step !== step || !latest.current.seen) change({ step, seen: true });
    heading.current?.focus();
  }, [
    ready,
    routeStep,
    step,
    index,
    draft.workspaceId,
    draft.groupId,
    navigate,
    org,
    change,
    latest,
  ]);
  useEffect(() => {
    if (ready && draft.groupId && !draft.resourcesInitialized && assigned.data)
      change({ resourceIds: assigned.data.map((item) => item.id), resourcesInitialized: true });
  }, [ready, draft.groupId, draft.resourcesInitialized, assigned.data, change]);
  useEffect(() => {
    if (ready && experienceReady && !appearance.canEdit && draft.teamDraft.creating)
      change({ teamDraft: { ...latest.current.teamDraft, creating: false } });
  }, [ready, experienceReady, appearance.canEdit, draft.teamDraft.creating, change, latest]);
  const run = async (action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const exit = async (completed = false) => {
    change({ dismissed: true, seen: true, completed: completed || latest.current.completed });
    await flush();
    void navigate({ to: "/organizations/$organizationId", params: { organizationId: org } });
  };
  const advance = async (skip = false) => {
    let current = latest.current;
    if (step === "team") {
      const invitations = [
        ...new Set(
          current.teamDraft.invitations
            .flatMap((value) => value.split(","))
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
      if (invitations.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        throw new Error("Enter valid email addresses for your invitations.");
      if (current.teamDraft.creating) {
        if (!appearance.canEdit)
          throw new Error("An organization admin can create a new team space.");
        if (!current.teamDraft.workspaceName.trim() || !current.teamDraft.groupName.trim())
          throw new Error("Enter a workspace and team name.");
        const created = await api.createTeamSpace(org, {
          workspaceName: current.teamDraft.workspaceName,
          groupName: current.teamDraft.groupName,
          description: current.teamDraft.description,
        });
        change({
          ...current,
          workspaceId: created.workspace.id,
          groupId: created.group.id,
          evaluatorId: "",
          resourceIds: [],
          resourcesInitialized: true,
          evaluatorDraft: null,
          teamDraft: { ...current.teamDraft, creating: false },
        });
        current = latest.current;
        await flush();
        await workspaces.refetch();
      }
      if (!current.workspaceId || !current.groupId) throw new Error("Choose a workspace and team.");
      if (invitations.length && !canManage && !appearance.canEdit)
        throw new Error("You need team admin access to send invitations.");
      for (const email of invitations) {
        await api.createGroupInvitation(current.groupId, email, "VIEWER");
        change((value) => ({
          ...value,
          teamDraft: {
            ...value.teamDraft,
            invitations: value.teamDraft.invitations
              .flatMap((item) => item.split(","))
              .filter((item) => item.trim() !== email),
          },
        }));
        await flush();
      }
    }
    if (step === "plugins" && !skip && canManage) {
      const existing = await api.listGroupResources(current.groupId);
      for (const id of current.resourceIds) {
        if (!activeResources.some((item) => item.id === id))
          throw new Error("A selected plugin resource is unavailable. Review your selection.");
        if (canManageWorkspace) await api.assignWorkspaceResource(current.workspaceId, id);
        if (!existing.some((item) => item.id === id))
          await api.assignGroupResource(current.groupId, id);
      }
      for (const item of existing)
        if (!current.resourceIds.includes(item.id))
          await api.unassignGroupResource(current.groupId, item.id);
      await assigned.refetch();
    }
    if (step === "evaluator" && current.evaluatorDraft && !skip) {
      if (!canManage) throw new Error("You need team admin access to create an evaluator.");
      const value = current.evaluatorDraft;
      if (!value.name.trim() || !value.personalityId)
        throw new Error("Give your evaluator a name and choose its voice.");
      if (
        value.rules.some((rule) => !rule.name.trim() && rule.description.trim()) ||
        value.questions.some((question) => !question.text.trim())
      )
        throw new Error("Complete or remove empty rules and questions.");
      const created = await api.createEvaluator(current.groupId, {
        name: value.name.trim(),
        description: value.description,
        scope: "GROUP",
        groupId: current.groupId,
        effort: value.effort,
        avatar: value.avatar,
        personalityId: value.personalityId,
        evaluationEmphasis: value.evaluationEmphasis,
        evaluationNotes: value.evaluationNotes,
        rules: value.rules.filter((rule) => rule.name.trim()),
        questions: value.questions.filter((question) => question.text.trim()),
      });
      change({ evaluatorId: created.id, evaluatorDraft: null });
      await flush();
      await invalidateEvaluatorQueries(qc);
    }
    if (skip && step === "plugins") {
      const existing = await api.listGroupResources(current.groupId);
      change({ resourceIds: existing.map((item) => item.id), resourcesInitialized: true });
    }
    const skipped = new Set(latest.current.skipped);
    if (
      skip ||
      (step === "plugins" && !latest.current.resourceIds.length) ||
      (step === "evaluator" && !latest.current.evaluatorId)
    )
      skipped.add(step);
    else skipped.delete(step);
    const next = SETUP_STEPS[Math.min(index + 1, 4)];
    change({ step: next, dismissed: false, skipped: [...skipped] });
    await flush();
    await go(next);
  };
  const launch = async () => {
    if (!canManage || !group || !evaluator || !selectedResources.length)
      throw new Error("Choose an available team, plugin resource and evaluator before starting.");
    const assignedNow = await api.listGroupResources(draft.groupId);
    if (!selectedResources.every((resource) => assignedNow.some((item) => item.id === resource.id)))
      throw new Error(
        "Return to Plugins and continue to apply your resource selection before starting.",
      );
    const period = setupPeriod(latest.current.period);
    await flush();
    const active = await api.listActiveGroupReports(draft.groupId);
    if (!active.some((job) => job.evaluatorId === evaluator.id))
      await api.startEvaluatorReports(draft.groupId, [evaluator.id], { period });
    change({ completed: true, dismissed: true });
    await flush();
    window.location.assign(
      shortcutUrl(org, {
        kind: "group",
        id: draft.groupId,
        workspaceId: draft.workspaceId,
        name: "",
      }) + "?tab=reports",
    );
  };
  const nextDisabled =
    busy ||
    pluginBusy ||
    taskLoading ||
    !!taskError ||
    !ready ||
    (step === "team" &&
      (draft.teamDraft.creating
        ? !draft.teamDraft.workspaceName.trim() || !draft.teamDraft.groupName.trim()
        : !workspace || !group)) ||
    (step === "plugins" && credentialsDirty);
  return (
    <div className="setup-page min-h-dvh bg-background text-foreground">
      <header className="setup-header flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <img src={isotipo} alt="" className="size-7" />
          <span className="text-xl font-semibold tracking-tight">platformance</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <span
            role="status"
            aria-live="polite"
            className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
          >
            {state.saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : state.error ? null : (
              <Check className="size-4 text-success" />
            )}
            {!ready
              ? "Loading progress"
              : state.error
                ? "Progress not saved"
                : state.saving
                  ? "Saving…"
                  : state.dirty
                    ? "Changes pending"
                    : "Progress saved"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || pluginBusy || !ready}
            onClick={() => void run(() => exit())}
          >
            {step === "welcome" ? "Explore first" : "Save & exit"}
          </Button>
        </div>
      </header>
      {!ready ? (
        <main className="mx-auto max-w-2xl px-6 py-20">
          {state.loadFailed ? (
            <div role="alert">
              <h1 className="text-2xl font-semibold">Your setup could not be loaded</h1>
              <p className="mt-3 text-sm text-muted-foreground">{state.error}</p>
              <Button className="mt-5" onClick={() => void state.load()}>
                Try again
              </Button>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading your setup…
            </p>
          )}
        </main>
      ) : step === "welcome" ? (
        <main className="setup-welcome mx-auto max-w-4xl px-6 py-16 sm:py-24">
          <div className="setup-enter">
            <p className="setup-eyebrow">Let's get started</p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-5 text-4xl font-semibold tracking-tight outline-none sm:text-6xl"
            >
              Welcome{profile?.name ? ", " + profile.name.split(" ")[0] : ""}.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Set up your team, connect your plugins, and get your first evidence-backed evaluation.
            </p>
            <ol className="my-10 grid gap-5 sm:grid-cols-3">
              {[
                { icon: Users, title: "Your team", description: "Create your space" },
                { icon: Plug, title: "Your plugins", description: "GitHub, Jira and MCP" },
                { icon: Sparkles, title: "Your evaluator", description: "Choose what matters" },
              ].map(({ icon: Icon, title, description }) => (
                <li key={title} className="setup-welcome-item">
                  <div className="mb-4 grid size-12 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Icon className="size-6" />
                  </div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
            <Button size="lg" disabled={busy} onClick={() => void run(() => advance())}>
              Set up my team
              <ArrowRight className="ml-3 size-4" />
            </Button>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="size-4" />
              Continue at your own pace.
            </p>
          </div>
        </main>
      ) : (
        <div className="setup-layout">
          <aside className="setup-rail border-b bg-muted/20 px-5 py-5 md:border-b-0 md:border-r md:px-7 md:py-10">
            <p className="setup-eyebrow hidden md:block">First evaluation</p>
            <h2 className="mt-3 hidden max-w-56 text-xl font-semibold leading-snug tracking-tight md:block">
              A clear picture of your team's work.
            </h2>
            <ol className="flex gap-2 md:mt-10 md:flex-col md:gap-1" aria-label="Setup progress">
              {SETUP_STEPS.slice(1).map((item, i) => (
                <li
                  key={item}
                  className={step === item ? "min-w-0 flex-[3] md:flex-1" : "min-w-0 flex-1"}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    aria-current={step === item ? "step" : undefined}
                    disabled={busy || pluginBusy || i + 1 > index}
                    onClick={() =>
                      void run(async () => {
                        await flush();
                        await go(item);
                      })
                    }
                    className={`h-auto w-full justify-start gap-3 rounded-xl px-2 py-3 text-left md:px-3 md:py-4 ${step === item ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]" : ""}`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs transition-colors duration-200 ${i + 1 <= index ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]" : ""}`}
                    >
                      {i + 1 < index ? (
                        draft.skipped.includes(item) ? (
                          <span aria-label="Set up later">&ndash;</span>
                        ) : (
                          <Check className="size-3.5 animate-in zoom-in-75 duration-200" />
                        )
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={`truncate text-xs font-medium md:text-sm ${step === item ? "" : "hidden md:inline"}`}
                    >
                      {LABELS[item]}
                    </span>
                  </Button>
                </li>
              ))}
            </ol>
            <p className="mt-12 hidden text-xs text-muted-foreground md:block">
              You can finish later.
            </p>
          </aside>
          <main className="setup-main min-w-0 px-5 py-8 sm:px-8 sm:py-10">
            <div className="mx-auto w-full max-w-4xl">
              <div key={step} className="setup-enter">
                <p className="setup-eyebrow">Step {index} of 4</p>
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="mt-3 text-2xl font-semibold tracking-tight outline-none sm:text-4xl"
                >
                  {TITLES[step]}
                </h1>
                <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {DESCRIPTIONS[step]}
                </p>
                {taskLoading ? (
                  <p role="status" className="mb-5 flex gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Loading this step…
                  </p>
                ) : null}
                {taskError ? (
                  <p role="alert" className="setup-error mb-5">
                    This step could not be loaded.{" "}
                    <Button variant="link" onClick={() => void qc.invalidateQueries()}>
                      Try again
                    </Button>
                  </p>
                ) : null}
                <fieldset
                  disabled={busy || pluginBusy}
                  className="min-w-0 space-y-6"
                  onBlurCapture={() => void flush().catch(() => {})}
                >
                  {step === "team" && (
                    <SetupTeam
                      draft={draft}
                      onChange={change}
                      flush={flush}
                      organization={organization}
                      workspaces={workspaces.data ?? []}
                      groups={groups.data ?? []}
                      canCreate={!!appearance.canEdit}
                      canInvite={canManage || !!appearance.canEdit}
                    />
                  )}
                  {step === "plugins" && (
                    <SetupPlugins
                      org={org}
                      draft={draft}
                      resources={resources.data ?? []}
                      onChange={change}
                      canConnect={!!appearance.canEdit}
                      canAssign={canManage}
                      beforeAuthorize={flush}
                      onCredentialsChange={setCredentialsDirty}
                      onBusyChange={setPluginBusy}
                    />
                  )}
                  {step === "evaluator" && (
                    <SetupEvaluator
                      organizationId={org}
                      workspaceName={workspace?.name ?? "Workspace"}
                      groupName={group?.name ?? "Project"}
                      draft={draft}
                      evaluators={evaluators.data ?? []}
                      voices={voices.data ?? []}
                      onChange={change}
                      canManage={canManage}
                    />
                  )}
                  {step === "review" && (
                    <div className="space-y-6">
                      <SetupReview
                        draft={draft}
                        onChange={change}
                        workspace={workspace}
                        group={group}
                        evaluator={evaluator}
                        resourceCount={selectedResources.length}
                        canManage={canManage}
                        onEdit={(target) =>
                          void run(async () => {
                            await flush();
                            await go(target);
                          })
                        }
                      />
                    </div>
                  )}
                </fieldset>
              </div>
            </div>
          </main>
          <footer className="setup-footer flex flex-wrap items-center justify-between gap-3 border-t bg-background px-5 py-4 sm:px-8">
            <Button
              variant="outline"
              disabled={busy || pluginBusy}
              onClick={() =>
                void run(async () => {
                  await flush();
                  await go(SETUP_STEPS[Math.max(0, index - 1)]);
                })
              }
            >
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {["plugins", "evaluator"].includes(step) && (
                <Button
                  variant="ghost"
                  disabled={busy || pluginBusy || credentialsDirty}
                  onClick={() => void run(() => advance(true))}
                >
                  Set up later
                </Button>
              )}
              {step === "review" ? (
                <>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => exit(true))}
                  >
                    Finish setup only
                  </Button>
                  <Button
                    disabled={
                      busy ||
                      taskLoading ||
                      !!taskError ||
                      !canManage ||
                      !evaluator ||
                      !selectedResources.length
                    }
                    onClick={() => void run(launch)}
                  >
                    {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Start evaluation
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </>
              ) : (
                <Button disabled={nextDisabled} onClick={() => void run(() => advance())}>
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {step === "team" && draft.teamDraft.invitations.some((email) => email.trim())
                    ? "Continue & invite"
                    : "Continue"}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              )}
            </div>
          </footer>
        </div>
      )}
      {(actionError || state.error) && ready && (
        <div role="alert" className="setup-alert">
          <p>{actionError || state.error}</p>
          {state.error && (
            <Button size="sm" variant="outline" onClick={() => void run(flush)}>
              Retry saving
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={state.blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) state.blocker.reset?.();
        }}
        title="Leave with unsaved changes?"
        description={
          credentialsDirty
            ? "Plugin credentials are not saved until you connect. Saved setup progress will stay."
            : "Your latest edits could not be saved. Stay to retry, or leave with your previously saved progress."
        }
        confirmLabel="Leave anyway"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => state.blocker.proceed?.()}
      />
    </div>
  );
}
