import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Setup, SetupStep } from "@/lib/experience";
import type { Organization, Workspace, Group, Evaluator } from "@/lib/types";
import { EvaluatorMark } from "./EvaluatorMark";
import { EvaluatorScopeBadge } from "./EvaluatorScopeBadge";

export function SetupTeam({
  draft,
  onChange,
  flush,
  organization,
  workspaces,
  groups,
  canCreate,
  canInvite,
}: {
  draft: Setup;
  onChange: (patch: Partial<Setup>) => void;
  flush: () => Promise<void>;
  organization?: Organization;
  workspaces: Workspace[];
  groups: Group[];
  canCreate: boolean;
  canInvite: boolean;
}) {
  return (
    <>
      <div className="border-b pb-5">
        <p className="text-xs text-muted-foreground">Organization</p>
        <p className="mt-1 font-medium">{organization?.name || "Your organization"}</p>
      </div>
      {draft.teamDraft.creating && canCreate ? (
        <div className="space-y-5">
          <label className="grid gap-2 text-sm font-medium">
            Workspace
            <Input
              aria-label="Workspace"
              value={draft.teamDraft.workspaceName}
              maxLength={160}
              placeholder="Product"
              onChange={(event) =>
                onChange({ teamDraft: { ...draft.teamDraft, workspaceName: event.target.value } })
              }
              onBlur={() => void flush().catch(() => {})}
            />
            <span className="text-xs font-normal text-muted-foreground">
              A space for related teams.
            </span>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Team
            <Input
              aria-label="Team"
              value={draft.teamDraft.groupName}
              maxLength={160}
              placeholder="Engineering"
              onChange={(event) =>
                onChange({ teamDraft: { ...draft.teamDraft, groupName: event.target.value } })
              }
              onBlur={() => void flush().catch(() => {})}
            />
            <span className="text-xs font-normal text-muted-foreground">
              The project you want to evaluate.
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-5">
          <label className="grid gap-2 text-sm font-medium">
            Workspace
            <Select
              value={draft.workspaceId || undefined}
              onValueChange={(value) =>
                onChange({
                  workspaceId: value,
                  groupId: "",
                  evaluatorId: "",
                  resourceIds: [],
                  resourcesInitialized: false,
                  evaluatorDraft: null,
                  teamDraft: { ...draft.teamDraft, creating: false },
                })
              }
            >
              <SelectTrigger aria-label="Workspace">
                <SelectValue placeholder="Choose a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Team
            <Select
              value={draft.groupId || undefined}
              disabled={!draft.workspaceId}
              onValueChange={(value) =>
                onChange({
                  groupId: value,
                  evaluatorId: "",
                  resourceIds: [],
                  resourcesInitialized: false,
                  evaluatorDraft: null,
                })
              }
            >
              <SelectTrigger aria-label="Team">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      )}
      {canCreate && (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() =>
            onChange({ teamDraft: { ...draft.teamDraft, creating: !draft.teamDraft.creating } })
          }
        >
          {draft.teamDraft.creating
            ? "Already have a team? Choose existing"
            : "Create a new team space"}
        </Button>
      )}
      {canInvite && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group -ml-3">
              <Users className="mr-2 size-4" />
              Invite teammates · Optional
              <ChevronDown className="ml-3 size-4 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <label className="grid gap-2 text-sm">
              Email addresses
              <Textarea
                aria-label="Teammate emails"
                value={draft.teamDraft.invitations.join("\n")}
                onChange={(event) =>
                  onChange({
                    teamDraft: { ...draft.teamDraft, invitations: event.target.value.split("\n") },
                  })
                }
                placeholder="alex@example.com"
              />
              <span className="text-xs text-muted-foreground">
                One email per line. Invitations are sent when you continue.
              </span>
            </label>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

export function SetupReview({
  draft,
  onChange,
  workspace,
  group,
  evaluator,
  resourceCount,
  canManage,
  onEdit,
}: {
  draft: Setup;
  onChange: (patch: Partial<Setup>) => void;
  workspace?: Workspace;
  group?: Group;
  evaluator?: Evaluator;
  resourceCount: number;
  canManage: boolean;
  onEdit: (step: SetupStep) => void;
}) {
  return (
    <>
      <div className="divide-y rounded-xl border">
        {[
          {
            label: "Team",
            text: [workspace?.name, group?.name].filter(Boolean).join(" / ") || "Choose a team",
            target: "team" as const,
          },
          {
            label: "Plugins",
            text: resourceCount ? `${resourceCount} resources selected` : "Set up later",
            target: "plugins" as const,
          },
          {
            label: "Evaluator",
            text: evaluator?.name || "Set up later",
            target: "evaluator" as const,
          },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 p-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <div className="mt-2 flex items-center gap-3">
                {item.target === "evaluator" && evaluator && (
                  <EvaluatorMark name={evaluator.name} avatar={evaluator.avatar} size={36} />
                )}
                <span className="text-sm font-medium">{item.text}</span>
                {item.target === "evaluator" && evaluator && (
                  <EvaluatorScopeBadge scope={evaluator.scope} />
                )}
              </div>
            </div>
            <Button
              variant="link"
              aria-label={`Edit ${item.label.toLowerCase()}`}
              onClick={() => onEdit(item.target)}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Evaluation period
        <Select
          value={draft.period.preset}
          onValueChange={(preset) =>
            onChange({ period: { ...draft.period, preset: preset as Setup["period"]["preset"] } })
          }
        >
          <SelectTrigger aria-label="Evaluation period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="custom">Custom dates</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {draft.period.preset === "custom" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            From
            <Input
              type="date"
              value={draft.period.from ?? ""}
              onChange={(event) =>
                onChange({ period: { ...draft.period, from: event.target.value || undefined } })
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            To
            <Input
              type="date"
              value={draft.period.to ?? ""}
              onChange={(event) =>
                onChange({ period: { ...draft.period, to: event.target.value || undefined } })
              }
            />
          </label>
        </div>
      )}
      <p className="rounded-xl bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand-ink)]">
        Your report will appear in Reports. You can keep working while it runs.
      </p>
      {(!canManage || !evaluator || !resourceCount) && (
        <p className="text-sm text-muted-foreground">
          You can finish setup now. Starting an evaluation requires team admin access, an evaluator
          and an available plugin resource.
        </p>
      )}
    </>
  );
}
