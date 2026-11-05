import { ChevronDown, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { evaluatorConfigurationHref } from "@/lib/evaluators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  EVALUATOR_CHARACTERS,
  EVALUATOR_COLORS,
  avatarParts,
  packAvatar,
} from "@/lib/evaluator-avatars";
import { EVALUATION_EMPHASIS_VALUES, EMPHASIS_LABELS } from "@/lib/evaluation-guidelines";
import type { Evaluator, Personality } from "@/lib/types";
import type { Setup, SetupEvaluatorDraft } from "@/lib/experience";
import { EvaluatorMark } from "./EvaluatorMark";
import { EvaluatorScopeBadge } from "./EvaluatorScopeBadge";

function setupEvaluatorFrom(evaluator: Evaluator): SetupEvaluatorDraft {
  return {
    baseId: evaluator.id,
    name: evaluator.name,
    description: evaluator.description ?? "",
    avatar: evaluator.avatar,
    personalityId: evaluator.personalityId,
    effort: evaluator.effort,
    evaluationEmphasis: evaluator.evaluationEmphasis,
    evaluationNotes: evaluator.evaluationNotes ?? "",
    rules: evaluator.rules.map((rule) => ({
      name: rule.name,
      description: rule.description ?? "",
      valuation: rule.valuation,
    })),
    questions: (evaluator.questions ?? []).map((question) => ({ text: question.text })),
  };
}

export function SetupEvaluator({
  organizationId,
  workspaceName,
  groupName,
  draft,
  evaluators,
  voices,
  onChange,
  canManage,
}: {
  organizationId: string;
  workspaceName: string;
  groupName: string;
  draft: Setup;
  evaluators: Evaluator[];
  voices: Personality[];
  onChange: (patch: Partial<Setup>) => void;
  canManage: boolean;
}) {
  const value = draft.evaluatorDraft;
  const selected = evaluators.find((item) => item.id === draft.evaluatorId);
  const patch = (change: Partial<SetupEvaluatorDraft>) => {
    if (value) onChange({ evaluatorDraft: { ...value, ...change } });
  };
  return (
    <div className="space-y-7">
      <div className="space-y-5" aria-label="Existing evaluators">
        {(["GROUP", "WORKSPACE"] as const).map((scope) => (
          <section
            key={scope}
            aria-label={scope === "GROUP" ? "Project evaluators" : "From workspace"}
            className="space-y-3"
          >
            <div>
              <h3 className="font-medium">
                {scope === "GROUP" ? "Project evaluators" : "From workspace"}{" "}
                <span className="text-muted-foreground">
                  {evaluators.filter((item) => item.scope === scope).length}
                </span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {scope === "GROUP" ? groupName : workspaceName}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {evaluators
                .filter((item) => item.scope === scope)
                .map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    type="button"
                    className={`h-auto justify-start gap-3 whitespace-normal p-4 text-left ${(!value && draft.evaluatorId === item.id) || value?.baseId === item.id ? "setup-selected" : ""}`}
                    aria-pressed={
                      (!value && draft.evaluatorId === item.id) || value?.baseId === item.id
                    }
                    onClick={() => onChange({ evaluatorId: item.id, evaluatorDraft: null })}
                  >
                    <EvaluatorMark avatar={item.avatar} name={item.name} size={34} />
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        {item.name}
                        <EvaluatorScopeBadge scope={item.scope} />
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {scope === "WORKSPACE" ? workspaceName : groupName}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {item.personality?.name || item.effort.toLowerCase()}
                      </span>
                    </span>
                  </Button>
                ))}
            </div>
          </section>
        ))}
        {!evaluators.length && (
          <p className="col-span-full text-sm text-muted-foreground">
            No evaluators are available for this team yet.
          </p>
        )}
      </div>
      {!value && selected && (
        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center gap-4">
            <EvaluatorMark avatar={selected.avatar} name={selected.name} size={64} />
            <div>
              <h2 className="font-semibold">{selected.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <EvaluatorScopeBadge scope={selected.scope} />
                <span className="text-sm text-muted-foreground">
                  {selected.scope === "WORKSPACE" ? workspaceName : groupName}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.description || "Ready to review your team's work."}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {selected.scope === "WORKSPACE"
              ? "Available in all projects. "
              : `Only available in ${groupName}. `}
            Choosing an evaluator does not start an evaluation.
          </p>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link
              to={evaluatorConfigurationHref(organizationId, selected)}
              target="_blank"
              rel="noreferrer"
            >
              View evaluator configuration <ExternalLink className="ml-1 size-3.5" />
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Use this evaluator as it is, or customize a copy for your team.
          </p>
          {canManage && (
            <div className="space-y-2">
              <Button
                variant="outline"
                disabled={!voices.length}
                onClick={() => onChange({ evaluatorDraft: setupEvaluatorFrom(selected) })}
              >
                Customize a copy
              </Button>
              <p className="text-xs text-muted-foreground">
                Creates a project evaluator in {groupName}. The original stays unchanged.
              </p>
            </div>
          )}
        </div>
      )}
      {value && (
        <fieldset disabled={!canManage} className="space-y-6 border-t pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <EvaluatorScopeBadge scope="GROUP" />
            <p className="text-sm">New copy in {groupName}</p>
          </div>
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-6">
              <label className="grid gap-2 text-sm font-medium">
                Name
                <Input
                  maxLength={120}
                  value={value.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  required
                />
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium">Voice</p>
                <div className="flex flex-wrap gap-2" aria-label="Evaluator voice">
                  {voices.map((voice) => (
                    <Button
                      key={voice.id}
                      type="button"
                      variant="outline"
                      aria-pressed={voice.id === value.personalityId}
                      className={voice.id === value.personalityId ? "setup-selected" : ""}
                      onClick={() => patch({ personalityId: voice.id })}
                    >
                      {voice.name}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  How the evaluator communicates, not how it scores.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Focus</p>
                <div className="flex flex-wrap gap-3">
                  {["ENGINEERING", "PEOPLE"].map((emphasis) => (
                    <label
                      key={emphasis}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={value.evaluationEmphasis.includes(emphasis)}
                        disabled={
                          !value.evaluationEmphasis.includes(emphasis) &&
                          value.evaluationEmphasis.length >= 3
                        }
                        onCheckedChange={(checked) =>
                          patch({
                            evaluationEmphasis: checked
                              ? [...value.evaluationEmphasis, emphasis]
                              : value.evaluationEmphasis.filter((item) => item !== emphasis),
                          })
                        }
                      />
                      {emphasis === "ENGINEERING" ? "Engineering" : "People"}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4 lg:border-l lg:pl-6">
              <p className="text-sm font-medium">Character</p>
              <div className="flex justify-center py-2">
                <EvaluatorMark
                  name={value.name || "Evaluator preview"}
                  avatar={value.avatar}
                  size={80}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-1" aria-label="Evaluator character">
                {EVALUATOR_CHARACTERS.map((character, index) => (
                  <Button
                    key={character.variant}
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Use ${character.label} character`}
                    aria-pressed={avatarParts(value.avatar).character === index}
                    className={
                      avatarParts(value.avatar).character === index ? "setup-selected" : ""
                    }
                    onClick={() =>
                      patch({ avatar: packAvatar(index, avatarParts(value.avatar).color) })
                    }
                  >
                    <EvaluatorMark
                      name={character.label}
                      avatar={packAvatar(index, avatarParts(value.avatar).color)}
                      size={26}
                    />
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-1" aria-label="Evaluator color">
                {EVALUATOR_COLORS.map((color, index) => (
                  <Button
                    key={color.label}
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Use ${color.label} character color`}
                    aria-pressed={avatarParts(value.avatar).color === index}
                    className={avatarParts(value.avatar).color === index ? "setup-selected" : ""}
                    onClick={() =>
                      patch({ avatar: packAvatar(avatarParts(value.avatar).character, index) })
                    }
                  >
                    <span
                      className="size-5 rounded-full border"
                      style={{ backgroundColor: color.color }}
                    />
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="group -ml-3">
                <ChevronDown className="mr-2 size-4 transition-transform group-data-[state=open]:rotate-180" />
                Advanced settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-4">
              <label className="grid gap-2 text-sm font-medium">
                Description
                <Textarea
                  maxLength={2000}
                  value={value.description}
                  onChange={(event) => patch({ description: event.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Evaluation effort
                <Select
                  value={value.effort}
                  onValueChange={(effort) =>
                    patch({ effort: effort as SetupEvaluatorDraft["effort"] })
                  }
                >
                  <SelectTrigger aria-label="Evaluation effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium">Additional focus · Choose up to three</p>
                {EVALUATION_EMPHASIS_VALUES.filter(
                  (item) => !["ENGINEERING", "PEOPLE"].includes(item),
                ).map((emphasis) => (
                  <label key={emphasis} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={value.evaluationEmphasis.includes(emphasis)}
                      disabled={
                        !value.evaluationEmphasis.includes(emphasis) &&
                        (value.evaluationEmphasis.length >= 3 ||
                          (emphasis === "GITHUB_EVIDENCE" &&
                            value.evaluationEmphasis.includes("TICKET_EVIDENCE")) ||
                          (emphasis === "TICKET_EVIDENCE" &&
                            value.evaluationEmphasis.includes("GITHUB_EVIDENCE")))
                      }
                      onCheckedChange={(checked) =>
                        patch({
                          evaluationEmphasis: checked
                            ? [...value.evaluationEmphasis, emphasis]
                            : value.evaluationEmphasis.filter((item) => item !== emphasis),
                        })
                      }
                    />
                    {EMPHASIS_LABELS[emphasis]}
                  </label>
                ))}
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Evaluation notes
                <Textarea
                  maxLength={2000}
                  value={value.evaluationNotes}
                  onChange={(event) => patch({ evaluationNotes: event.target.value })}
                />
              </label>
              <div className="space-y-3">
                <p className="text-sm font-medium">Rules</p>
                {value.rules.map((rule, index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-3">
                    <div className="flex gap-2">
                      <Input
                        aria-label={`Rule ${index + 1} name`}
                        placeholder="Rule name"
                        value={rule.name}
                        maxLength={120}
                        onChange={(event) =>
                          patch({
                            rules: value.rules.map((item, i) =>
                              i === index ? { ...item, name: event.target.value } : item,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove rule ${index + 1}`}
                        onClick={() => patch({ rules: value.rules.filter((_, i) => i !== index) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Textarea
                      aria-label={`Rule ${index + 1} description`}
                      placeholder="What should be evaluated?"
                      maxLength={2000}
                      value={rule.description}
                      onChange={(event) =>
                        patch({
                          rules: value.rules.map((item, i) =>
                            i === index ? { ...item, description: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <label className="flex items-center gap-3 text-xs">
                      Weight
                      <Input
                        aria-label={`Rule ${index + 1} weight`}
                        className="w-20"
                        type="number"
                        min={1}
                        max={10}
                        value={rule.valuation}
                        onChange={(event) =>
                          patch({
                            rules: value.rules.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    valuation: Math.min(
                                      10,
                                      Math.max(1, Number(event.target.value) || 1),
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({ rules: [...value.rules, { name: "", description: "", valuation: 5 }] })
                  }
                >
                  <Plus className="mr-2 size-4" />
                  Add rule
                </Button>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Questions · Up to six</p>
                {value.questions.map((question, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      aria-label={`Question ${index + 1}`}
                      value={question.text}
                      maxLength={500}
                      onChange={(event) =>
                        patch({
                          questions: value.questions.map((item, i) =>
                            i === index ? { text: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        patch({ questions: value.questions.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={value.questions.length >= 6}
                  onClick={() => patch({ questions: [...value.questions, { text: "" }] })}
                >
                  <Plus className="mr-2 size-4" />
                  Add question
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Customizing creates a project evaluator in {groupName} when you continue. The original
            evaluator stays unchanged.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ evaluatorDraft: null })}
          >
            Use original evaluator
          </Button>
        </fieldset>
      )}
    </div>
  );
}
