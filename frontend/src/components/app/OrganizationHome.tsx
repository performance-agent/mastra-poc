import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  ArrowUpRight,
  Sparkles,
  Star,
  Clock3,
  FolderOpen,
  ArrowRight,
  Building2,
} from "lucide-react";

import { Avatar } from "@/components/app/Avatar";
import { Button } from "@/components/ui/button";
import { PersonalizeDialog } from "@/components/app/PersonalizeDialog";
import { useNavigate } from "@tanstack/react-router";
import { normalizeSetup, setupUrl } from "@/lib/experience";

import { api } from "@/lib/api";
import { useExperience, shortcutUrl } from "@/lib/experience-context";
import { useImageSource } from "@/lib/media";
import { BLOCK_LABELS, type Shortcut } from "@/lib/experience";

export function OrganizationHome() {
  const experience = useExperience();
  const opened = useRef<string | null>(null);
  const { organizationId: org, profile, appearance, preferences } = experience;
  const organizations = useQuery({ queryKey: ["organizations"], queryFn: api.listOrganizations });
  const workspaces = useQuery({
    queryKey: ["organization", org, "workspaces"],
    queryFn: () => api.listOrgWorkspaces(org!),
    enabled: !!org,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const openSetup = () => {
    if (org) void navigate({ to: setupUrl(org, normalizeSetup(setup.data ?? {}).step) } as never);
  };

  const cover = useImageSource(appearance.cover);
  const organization = organizations.data?.find((o) => o.id === org);
  const setup = useQuery({
    queryKey: ["setup", profile?.id, org],
    queryFn: () => api.setup(org!),
    enabled: !!org && !!profile,
  });
  useEffect(() => {
    if (
      !org ||
      !profile ||
      !setup.data ||
      opened.current === org ||
      setup.data.seen ||
      setup.data.dismissed ||
      normalizeSetup(setup.data).step !== "welcome"
    )
      return;
    if (!appearance.canEdit || !workspaces.data || workspaces.data.length) return;
    opened.current = org;
    void navigate({ to: setupUrl(org, "welcome"), replace: true } as never);
  }, [org, profile, setup.data, appearance.canEdit, workspaces.data, navigate]);
  const recentGroups = preferences.recent.filter((s) => s.kind === "group");
  const reports = useQuery({
    queryKey: ["home-reports", profile?.id, org, recentGroups.map((g) => g.id)],
    queryFn: async () => {
      const results = await Promise.all(
        recentGroups.map(async (group) => {
          return (await api.listGroupReports(group.id)).map((report) => ({ ...report, group }));
        }),
      );
      return results
        .flat()
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 5);
    },
    enabled: !!org && !!profile,
  });
  const shortcutList = (items: Shortcut[], empty: string) =>
    items.length ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.kind + item.id}
            href={shortcutUrl(org!, item)}
            className="experience-shortcut group"
          >
            <Avatar name={item.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{item.kind}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        ))}
      </div>
    ) : (
      <p className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">
        {empty}
      </p>
    );
  const blocks = preferences.blocks ?? appearance.blocks;
  const prepared =
    Number(!!setup.data?.groupId) +
    Number(
      ["evaluator", "review"].includes(normalizeSetup(setup.data ?? {}).step) &&
        !normalizeSetup(setup.data ?? {}).skipped.includes("plugins"),
    ) +
    Number(!!setup.data?.evaluatorId);
  return (
    <>
      {organizations.error || experience.error ? (
        <div
          className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          Your workspace settings could not be loaded.{" "}
          <button
            className="underline"
            onClick={() => {
              void organizations.refetch();
              void experience.refresh();
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!organizations.isLoading && !organizations.data?.length && !organizations.error ? (
        <div className="experience-panel py-12 text-center">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-[var(--brand)]" />
          <h2 className="text-xl font-semibold">Give your team a place to grow</h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            Create an organization to connect your work and start exploring.
          </p>
          <Button onClick={openSetup}>Create organization</Button>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-w-0 space-y-5">
            {blocks.map((block) => {
              if (block === "welcome")
                return (
                  <section
                    key={block}
                    className="experience-welcome relative overflow-hidden rounded-3xl border p-7 sm:p-9"
                  >
                    {cover && (
                      <>
                        <img
                          src={cover}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-card/95 to-card/65" />
                      </>
                    )}
                    <div className="relative">
                      <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/20 bg-card/75 px-3 py-1 text-xs font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
                        {organization?.name ?? "Your organization"}
                      </span>
                      <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                        Welcome back{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}.
                      </h2>
                      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                        Bring your team's work into focus. Connect the evidence, meet your
                        evaluators, and discover what comes next.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Button disabled={!org} onClick={openSetup}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Prepare an evaluation
                        </Button>
                        {org && (
                          <a
                            href={`/organizations/${org}?tab=workspaces`}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                          >
                            Explore workspaces
                            <ArrowRight className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </section>
                );
              if (block === "favorites" || block === "recent")
                return (
                  <section key={block} className="experience-panel">
                    <div className="mb-4 flex items-center gap-2">
                      {block === "favorites" ? (
                        <Star className="h-4 w-4 text-[var(--brand-ink)]" />
                      ) : (
                        <Clock3 className="h-4 w-4 text-[var(--brand-ink)]" />
                      )}
                      <h2 className="font-semibold">{BLOCK_LABELS[block]}</h2>
                    </div>
                    {shortcutList(
                      block === "favorites"
                        ? preferences.favorites
                        : preferences.recent.slice(0, 6),
                      block === "favorites"
                        ? "Star a workspace or group to keep it close. Your shortcuts will appear here."
                        : "The workspaces and groups you visit will appear here, ready for your next session.",
                    )}
                  </section>
                );
              if (block === "evaluations")
                return (
                  <section key={block} className="experience-panel">
                    <div className="mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[var(--brand-ink)]" />
                      <h2 className="font-semibold">Recent evaluations</h2>
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      From your recently visited groups
                    </p>
                    {reports.error ? (
                      <p role="alert" className="text-sm text-muted-foreground">
                        Reports could not be loaded.{" "}
                        <button className="underline" onClick={() => void reports.refetch()}>
                          Try again
                        </button>
                      </p>
                    ) : reports.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading evaluations - </p>
                    ) : reports.data?.length ? (
                      <div className="divide-y">
                        {reports.data.map((report) => (
                          <a
                            key={report.id}
                            href={`${shortcutUrl(org!, report.group)}?tab=reports`}
                            className="flex items-center justify-between gap-3 py-3 text-sm"
                          >
                            <div>
                              <p className="font-medium">{report.title || report.group.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {report.createdAt
                                  ? new Date(report.createdAt).toLocaleDateString()
                                  : "Saved report"}
                              </p>
                            </div>
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                        No saved evaluations in your recent groups yet. Start with the setup guide
                        or visit a group's Reports.
                      </p>
                    )}
                  </section>
                );
              return (
                <section
                  key={block}
                  className="experience-setup flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-[var(--brand-soft)] p-3">
                      <Sparkles className="h-6 w-6 text-[var(--brand-ink)]" />
                    </div>
                    <div>
                      <h2 className="font-semibold">Getting started</h2>
                      <div className="mt-2 flex items-center gap-3">
                        <progress
                          aria-label="Setup tasks completed"
                          value={prepared}
                          max={3}
                          className="h-1.5 w-24"
                        />
                        <span className="text-xs text-muted-foreground">
                          {prepared}/3 tasks complete
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {setup.data?.completed
                          ? "Your space is ready. Explore the optional next steps."
                          : "Your next step, right here. Connect tools whenever you are ready."}
                      </p>
                    </div>
                  </div>
                  <Button disabled={!org} onClick={openSetup}>
                    {setup.data?.completed ? "Review setup" : "Continue setup"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </section>
              );
            })}
            {!blocks.length && (
              <div className="experience-panel text-center">
                <p className="mb-3 text-sm text-muted-foreground">Your home is a blank canvas.</p>
                <Button onClick={() => setSettingsOpen(true)}>Choose your blocks</Button>
              </div>
            )}
          </div>
          <aside className="space-y-5">
            <section className="experience-panel">
              <div className="mb-5 flex items-center gap-3">
                <Avatar
                  name={organization?.name ?? "Organization"}
                  src={organization?.photoUrl}
                  size="lg"
                />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{organization?.name ?? "Your spaces"}</h2>
                  <p className="text-xs text-muted-foreground">Connected work starts here</p>
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="experience-eyebrow">Workspaces</h3>
                <span className="text-xs text-muted-foreground">
                  {workspaces.data?.length ?? " - "}
                </span>
              </div>
              <div className="space-y-1">
                {workspaces.data?.map((w) => (
                  <a
                    key={w.id}
                    href={`/organizations/${org}/workspaces/${w.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-3 text-sm hover:bg-muted"
                  >
                    <FolderOpen className="h-4 w-4 text-[var(--brand-ink)]" />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                ))}
              </div>
              {!workspaces.data?.length && (
                <p className="py-3 text-sm text-muted-foreground">
                  Your first workspace is a few steps away.
                </p>
              )}
              {org && (
                <a
                  href={`/organizations/${org}?tab=workspaces`}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-ink)]"
                >
                  View all workspaces
                  <ArrowRight className="h-3 w-3" />
                </a>
              )}
            </section>
            <div className="px-2 text-xs leading-5 text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Built around your team.</p>
              <p>
                Your organization's identity. Your own shortcuts. One place to turn evidence into
                understanding.
              </p>
            </div>
          </aside>
        </div>
      )}
      <PersonalizeDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
