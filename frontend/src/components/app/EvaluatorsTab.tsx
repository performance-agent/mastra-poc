import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EvaluatorMark } from "@/components/app/EvaluatorMark";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { LoadingState } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import {
  EVALUATOR_CHARACTERS,
  EVALUATOR_COLORS,
  avatarParts,
  packAvatar,
} from "@/lib/evaluator-avatars";
import { EVALUATION_EMPHASIS_VALUES, type EvaluationEmphasis } from "@/lib/evaluation-guidelines";
import type {
  Evaluator,
  EvaluatorEffort,
  EvaluatorInput,
  EvaluatorScope,
} from "@/lib/types";

const MAX_BEHAVIOR_RULES = 4;
const MAX_PERSONALITIES = 3;
const MAX_QUESTIONS = 6;

const EFFORTS: Array<{ value: EvaluatorEffort; label: string; hint: string }> = [
  {
    value: "LOW",
    label: "Minimum",
    hint: "A short report. It reads the same stored history as the other levels.",
  },
  { value: "MEDIUM", label: "Medium", hint: "More context, from the same stored history." },
  { value: "HIGH", label: "Maximum", hint: "A fuller explanation of the same stored history." },
];

const EFFORT_LOOK = [
  {
    fill: "bg-teal-400",
    glow: "",
    sparkles: 5,
    duration: 3.4,
  },
  {
    fill: "bg-cyan-500",
    glow: "shadow-[0_0_18px_rgba(6,182,212,0.4)]",
    sparkles: 9,
    duration: 2.1,
  },
  {
    fill: "bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-400",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.45)]",
    sparkles: 16,
    duration: 1.15,
  },
] as const;

function EffortSparkles({ count, duration }: { count: number; duration: number }) {
  if (count === 0) return null;
  return (
    <>
      <style>{`
        @keyframes effort-dot {
          0% { transform: translateX(0); opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 0.8; }
          100% { transform: translateX(var(--effort-travel, 48px)); opacity: 0; }
        }
      `}</style>
      {Array.from({ length: count }, (_, i) => {
        const top = 18 + ((i * 47) % 64);
        const size = i % 4 === 0 ? 3.5 : 2;
        const travel = 88 + ((i * 29) % 72);
        return (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full bg-white/90"
            style={{
              left: `${(i * 17) % 78}%`,
              top: `${top}%`,
              width: size,
              height: size,
              animation: `effort-dot ${duration + (i % 4) * 0.35}s linear ${(i % 7) * 0.22}s infinite`,
              ["--effort-travel" as string]: `${travel}px`,
            }}
          />
        );
      })}
    </>
  );
}

function effortFromRatio(ratio: number): EvaluatorEffort {
  const index = Math.round(Math.min(1, Math.max(0, ratio)) * (EFFORTS.length - 1));
  return EFFORTS[index]?.value ?? "MEDIUM";
}

function ratioFromClientX(clientX: number, rect: DOMRect) {
  const pad = 20;
  const usable = Math.max(1, rect.width - pad * 2);
  return Math.min(1, Math.max(0, (clientX - rect.left - pad) / usable));
}

function EffortSlider({
  value,
  disabled,
  onChange,
}: {
  value: EvaluatorEffort;
  disabled: boolean;
  onChange: (value: EvaluatorEffort) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const index = Math.max(
    0,
    EFFORTS.findIndex((effort) => effort.value === value),
  );
  const ratio = dragRatio ?? index / 2;
  const liveEffort = dragRatio === null ? value : effortFromRatio(dragRatio);
  const liveIndex = Math.max(
    0,
    EFFORTS.findIndex((effort) => effort.value === liveEffort),
  );
  const look = EFFORT_LOOK[liveIndex] ?? EFFORT_LOOK[0];
  const hint = EFFORTS[liveIndex]?.hint;
  const thumbLeft = `calc(1.25rem + (100% - 2.5rem) * ${ratio})`;
  const fillWidth = `calc(2.5rem + (100% - 2.5rem) * ${ratio})`;
  const dragging = pointerRef.current !== null;

  useEffect(() => {
    if (pointerRef.current !== null || dragRatio === null) return;
    if (Math.abs(dragRatio - index / 2) < 0.001) setDragRatio(null);
  }, [dragRatio, index]);

  const applyPointer = (clientX: number, commit: boolean) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextRatio = ratioFromClientX(clientX, rect);
    const snapped = Math.round(nextRatio * (EFFORTS.length - 1)) / (EFFORTS.length - 1);
    setDragRatio(commit ? snapped : nextRatio);
    const effort = effortFromRatio(commit ? snapped : nextRatio);
    if (effort !== value) onChange(effort);
  };

  return (
    <div className="grid gap-3">
      <div>
        <Label id="evaluator-effort-label">Effort</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className={`px-1 ${disabled ? "opacity-60" : ""}`}>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby="evaluator-effort-label"
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={index}
          aria-valuetext={EFFORTS[index]?.label}
          className={`relative h-12 touch-none select-none outline-none ${
            disabled ? "cursor-not-allowed" : dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={(event) => {
            if (disabled) return;
            pointerRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            applyPointer(event.clientX, false);
          }}
          onPointerMove={(event) => {
            if (pointerRef.current !== event.pointerId) return;
            applyPointer(event.clientX, false);
          }}
          onPointerUp={(event) => {
            if (pointerRef.current !== event.pointerId) return;
            pointerRef.current = null;
            applyPointer(event.clientX, true);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            pointerRef.current = null;
            setDragRatio(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              onChange(EFFORTS[Math.min(2, index + 1)]?.value ?? value);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              onChange(EFFORTS[Math.max(0, index - 1)]?.value ?? value);
            }
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-full bg-neutral-200" />
          <div
            aria-hidden
            className={`absolute left-0 top-1/2 h-8 -translate-y-1/2 overflow-hidden rounded-full ${look.fill} ${look.glow} ${
              dragging ? "" : "transition-[width,box-shadow] duration-300 ease-out"
            }`}
            style={{ width: fillWidth }}
          >
            <EffortSparkles count={look.sparkles} duration={look.duration} />
          </div>
          {EFFORTS.map((effort, stop) =>
            stop / (EFFORTS.length - 1) <= ratio ? null : (
              <span
                key={effort.value}
                aria-hidden
                className="pointer-events-none absolute top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400"
                style={{
                  left: stop === 0 ? "1.25rem" : stop === 1 ? "50%" : "calc(100% - 1.25rem)",
                }}
              />
            ),
          )}
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-lg ${
              dragging ? "" : "transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            }`}
            style={{ left: thumbLeft }}
          />
        </div>
        <div className="relative mt-1 h-4 text-xs">
          {EFFORTS.map((effort, stop) => (
            <span
              key={effort.value}
              className={`absolute top-0 whitespace-nowrap transition-colors duration-300 ${
                stop === 0
                  ? "left-0"
                  : stop === EFFORTS.length - 1
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2"
              } ${
                effort.value === liveEffort
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {effort.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type DraftRule = { key: string; name: string; description: string; valuation: number };
type DraftQuestion = { key: string; text: string };

function blankRule(): DraftRule {
  return { key: crypto.randomUUID(), name: "", description: "", valuation: 5 };
}

function blankQuestion(): DraftQuestion {
  return { key: crypto.randomUUID(), text: "" };
}

function isBlankRule(rule: DraftRule) {
  return !rule.name.trim() && !rule.description.trim();
}

function isBlankQuestion(question: DraftQuestion) {
  return !question.text.trim();
}

function withOpenRule(rules: DraftRule[]): DraftRule[] {
  return rules.length > 0 ? rules : [blankRule()];
}

function withOpenQuestion(questions: DraftQuestion[]): DraftQuestion[] {
  return questions.length > 0 ? questions : [blankQuestion()];
}

type Draft = {
  name: string;
  description: string;
  scope: EvaluatorScope;
  effort: EvaluatorEffort;
  avatar: number;
  personalityId: string;
  emphasis: EvaluationEmphasis[];
  notes: string;
  rules: DraftRule[];
  questions: DraftQuestion[];
};

function draftFrom(evaluator: Evaluator): Draft {
  return {
    name: evaluator.name,
    description: evaluator.description ?? "",
    scope: evaluator.scope,
    effort: evaluator.effort,
    avatar: evaluator.avatar,
    personalityId: evaluator.personalityId,
    emphasis: evaluator.evaluationEmphasis.filter((value): value is EvaluationEmphasis =>
      EVALUATION_EMPHASIS_VALUES.includes(value as EvaluationEmphasis),
    ),
    notes: evaluator.evaluationNotes ?? "",
    rules: withOpenRule(
      evaluator.rules.map((rule) => ({
        key: rule.id,
        name: rule.name,
        description: rule.description ?? "",
        valuation: rule.valuation,
      })),
    ),
    questions: withOpenQuestion(
      (evaluator.questions ?? []).map((question) => ({
        key: question.id,
        text: question.text,
      })),
    ),
  };
}

function emptyDraft(scope: EvaluatorScope, personalityId: string): Draft {
  return {
    name: "",
    description: "",
    scope,
    effort: "MEDIUM",
    avatar: packAvatar(0, 1),
    personalityId,
    emphasis: [],
    notes: "",
    rules: withOpenRule([]),
    questions: withOpenQuestion([]),
  };
}

export function EvaluatorsTab({
  groupId,
  canManageGroup,
  canManageWorkspace,
}: {
  groupId: string;
  canManageGroup: boolean;
  canManageWorkspace: boolean;
}) {
  const qc = useQueryClient();
  const evaluatorsQ = useQuery({
    queryKey: ["group", groupId, "evaluators"],
    queryFn: () => api.listEvaluators(groupId),
  });
  const personalitiesQ = useQuery({
    queryKey: ["group", groupId, "personalities"],
    queryFn: () => api.listPersonalities(groupId),
  });
  const evaluators = evaluatorsQ.data ?? [];
  const personalities = personalitiesQ.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [characterHover, setCharacterHover] = useState<number | null>(null);
  const [personalityDraft, setPersonalityDraft] = useState<{
    id?: string;
    name: string;
    instruction: string;
  } | null>(null);
  const [deletePersonalityId, setDeletePersonalityId] = useState<string | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (creating || selectedId || !evaluatorsQ.data?.length) return;
    const first = evaluatorsQ.data[0];
    setSelectedId(first.id);
    setDraft(draftFrom(first));
  }, [creating, evaluatorsQ.data, selectedId]);

  const fitInstruction = (element: HTMLTextAreaElement | null) => {
    if (!element || element.clientWidth === 0) return false;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
    return true;
  };

  useEffect(() => {
    if (!personalityDraft) return;
    let frame = 0;
    let attempts = 0;
    const tick = () => {
      if (fitInstruction(instructionRef.current) || attempts > 12) return;
      attempts += 1;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [personalityDraft]);

  const selected = evaluators.find((evaluator) => evaluator.id === selectedId) ?? null;
  const canEdit = draft?.scope === "WORKSPACE" ? canManageWorkspace : canManageGroup;

  useEffect(() => {
    if (!draft) return;
    const rules = withOpenRule(draft.rules);
    const questions = withOpenQuestion(draft.questions);
    if (rules === draft.rules && questions === draft.questions) return;
    setDraft({ ...draft, rules, questions });
  }, [draft]);

  const open = (evaluator: Evaluator) => {
    setCreating(false);
    setSelectedId(evaluator.id);
    setDraft(draftFrom(evaluator));
  };

  const startCreate = () => {
    const fallback =
      personalities.find((item) => item.name === "Direct") ?? personalities[0];
    if (!fallback) {
      toast.error("No personalities are available");
      return;
    }
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft("GROUP", fallback.id));
  };

  const persist = async () => {
    if (!draft) return;
    const body: EvaluatorInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      scope: draft.scope,
      effort: draft.effort,
      avatar: draft.avatar,
      personalityId: draft.personalityId,
      evaluationEmphasis: draft.emphasis,
      evaluationNotes: draft.notes.trim() || null,
      rules: draft.rules
        .filter((rule) => rule.name.trim())
        .map((rule) => ({
          name: rule.name.trim(),
          description: rule.description.trim() || null,
          valuation: rule.valuation,
        })),
      questions: draft.questions
        .filter((question) => question.text.trim())
        .map((question) => ({ text: question.text.trim() })),
      ...(draft.scope === "GROUP" ? { groupId } : {}),
    };
    setSaving(true);
    try {
      const saved = creating
        ? await api.createEvaluator(groupId, body)
        : await api.updateEvaluator(selectedId!, body);
      toast.success(creating ? "Evaluator created" : "Evaluator saved");
      await qc.invalidateQueries({ queryKey: ["group", groupId, "evaluators"] });
      setCreating(false);
      setSelectedId(saved.id);
      setDraft(draftFrom(saved));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!draft?.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (draft.scope === "WORKSPACE") {
      setConfirmOpen(true);
      return;
    }
    void persist();
  };

  const savePersonality = async () => {
    if (!personalityDraft?.name.trim() || !personalityDraft.instruction.trim()) {
      toast.error("Name and instruction are required");
      return;
    }
    const body = {
      name: personalityDraft.name.trim(),
      instruction: personalityDraft.instruction.trim(),
    };
    try {
      const saved = personalityDraft.id
        ? await api.updatePersonality(personalityDraft.id, body)
        : await api.createPersonality(groupId, body);
      toast.success(personalityDraft.id ? "Personality saved" : "Personality created");
      await qc.invalidateQueries({ queryKey: ["group", groupId, "personalities"] });
      await qc.invalidateQueries({ queryKey: ["group", groupId, "evaluators"] });
      setDraft((current) =>
        current && !personalityDraft.id ? { ...current, personalityId: saved.id } : current,
      );
      setPersonalityDraft(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removePersonality = async () => {
    if (!deletePersonalityId) return;
    try {
      await api.deletePersonality(deletePersonalityId);
      toast.success("Personality deleted");
      await qc.invalidateQueries({ queryKey: ["group", groupId, "personalities"] });
      await qc.invalidateQueries({ queryKey: ["group", groupId, "evaluators"] });
      const remaining = personalities.filter((item) => item.id !== deletePersonalityId);
      setDraft((current) =>
        current?.personalityId === deletePersonalityId
          ? { ...current, personalityId: remaining[0]?.id ?? current.personalityId }
          : current,
      );
      setDeletePersonalityId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (evaluatorsQ.isLoading) return <LoadingState />;
  if (evaluatorsQ.error) {
    return (
      <ErrorState message={errorMessage(evaluatorsQ.error)} onRetry={() => evaluatorsQ.refetch()} />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <Card className="h-fit rounded-xl p-3 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Evaluators</h2>
          {canManageGroup && (
            <Button size="sm" variant="outline" onClick={startCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>
        {evaluators.length === 0 ? (
          <EmptyState
            title="No evaluators yet"
            description="Create one to decide how this project should be read."
            actionLabel={canManageGroup ? "New evaluator" : undefined}
            onAction={canManageGroup ? startCreate : undefined}
          />
        ) : (
          <div className="space-y-4">
            {evaluators.map((evaluator) => {
              const selected = !creating && selectedId === evaluator.id;
              return (
                <button
                  key={evaluator.id}
                  type="button"
                  onClick={() => open(evaluator)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 text-left transition-[padding] duration-300 ${
                    selected
                      ? "py-3 text-foreground"
                      : "py-2 text-muted-foreground hover:text-foreground"
                  }`}
                  onMouseEnter={() => setHoveredId(evaluator.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === evaluator.id ? null : current))
                  }
                >
                  <EvaluatorMark
                    name={evaluator.name}
                    avatar={evaluator.avatar}
                    state={hoveredId === evaluator.id ? "hover" : "idle"}
                    size={selected ? 52 : 40}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {evaluator.name}
                    </span>
                    <span className="block text-[11px]">
                      {evaluator.scope === "WORKSPACE" ? "Workspace" : "Project"} ·{" "}
                      {evaluator.effort.toLowerCase()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {draft ? (
        <Card className="rounded-xl p-4 shadow-card sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {creating ? "New evaluator" : draft.name || "Evaluator"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                How it speaks, how it judges, and what the report has to answer.
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  onClick={requestSave}
                  disabled={saving}
                  className="hover:bg-primary"
                >
                  {saving ? "Saving..." : creating ? "Create" : "Save"}
                </Button>
                {!creating && selected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="hover:bg-red-600 hover:text-white"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="evaluator-name">Name</Label>
              <Input
                id="evaluator-name"
                value={draft.name}
                disabled={!canEdit}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evaluator-description">Description</Label>
              <Textarea
                id="evaluator-description"
                value={draft.description}
                disabled={!canEdit}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Personality</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How this evaluator speaks. Up to three. At least one stays.
                  </p>
                </div>
                {canManageWorkspace && personalities.length < MAX_PERSONALITIES && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPersonalityDraft({ name: "", instruction: "" })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> New
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {personalities.map((item) => {
                  const selected = draft.personalityId === item.id;
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={canEdit ? 0 : -1}
                      aria-pressed={selected}
                      onClick={() => {
                        if (!canEdit) return;
                        setDraft({ ...draft, personalityId: item.id });
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (!canEdit || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        setDraft({ ...draft, personalityId: item.id });
                      }}
                      className={`cursor-pointer rounded-xl border px-3 py-3 text-left ${
                        selected
                          ? "border-foreground bg-background shadow-card"
                          : "border-border text-muted-foreground"
                      } ${canEdit ? "" : "cursor-default"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="block min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        {canManageWorkspace && (
                          <div className="flex shrink-0">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={`Edit ${item.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPersonalityDraft({
                                  id: item.id,
                                  name: item.name,
                                  instruction: item.instruction,
                                });
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={`Delete ${item.name}`}
                              disabled={personalities.length <= 1}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeletePersonalityId(item.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <span className="mt-1 line-clamp-3 block text-xs">{item.instruction}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Behavior</Label>
                {canEdit && draft.rules.length < MAX_BEHAVIOR_RULES && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft({ ...draft, rules: [...draft.rules, blankRule()] })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                How it should judge what it sees. A short order, not a question to answer. Up to
                four. Importance is attention, not a score.
              </p>
              {draft.rules.map((rule, index) => (
                <div key={rule.key} className="grid gap-2 rounded-lg border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
                    <Input
                      aria-label="Rule name"
                      placeholder="Rule name"
                      value={rule.name}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const rules = draft.rules.slice();
                        rules[index] = { ...rule, name: event.target.value };
                        setDraft({ ...draft, rules });
                      }}
                    />
                    <Input
                      aria-label="Importance"
                      type="number"
                      min={1}
                      max={10}
                      value={rule.valuation}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const rules = draft.rules.slice();
                        rules[index] = {
                          ...rule,
                          valuation: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                        };
                        setDraft({ ...draft, rules });
                      }}
                    />
                  </div>
                  <Textarea
                    aria-label="Rule description"
                    placeholder="When you see this, judge it this way."
                    value={rule.description}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const rules = draft.rules.slice();
                      rules[index] = { ...rule, description: event.target.value };
                      setDraft({ ...draft, rules });
                    }}
                  />
                  {canEdit && !(draft.rules.length === 1 && isBlankRule(rule)) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="justify-self-start"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          rules: withOpenRule(draft.rules.filter((item) => item.key !== rule.key)),
                        })
                      }
                    >
                      Remove rule
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Questions</Label>
                {canEdit && draft.questions.length < MAX_QUESTIONS && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        questions: [...draft.questions, blankQuestion()],
                      })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                What the report has to answer. One short question each. These do not change the
                voice.
              </p>
              {draft.questions.map((question, index) => (
                <div key={question.key} className="flex items-start gap-2">
                  <Input
                    aria-label="Question"
                    placeholder="What should this report answer?"
                    value={question.text}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const questions = draft.questions.slice();
                      questions[index] = { ...question, text: event.target.value };
                      setDraft({ ...draft, questions });
                    }}
                  />
                  {canEdit && !(draft.questions.length === 1 && isBlankQuestion(question)) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          questions: withOpenQuestion(
                            draft.questions.filter((item) => item.key !== question.key),
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <div>
                <Label>Character</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a shape, then a color. Each evaluator keeps its own.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 overflow-visible py-4">
                {EVALUATOR_CHARACTERS.map((character, index) => {
                  const selected = avatarParts(draft.avatar).character === index;
                  return (
                    <button
                      key={character.variant}
                      type="button"
                      disabled={!canEdit}
                      aria-label={character.label}
                      aria-pressed={selected}
                      className={`origin-center rounded-2xl transition-transform duration-300 ease-out ${
                        selected
                          ? "z-10 scale-[1.65] drop-shadow-[0_14px_16px_rgba(0,0,0,0.16)]"
                          : "scale-100"
                      }`}
                      onMouseEnter={() => setCharacterHover(index)}
                      onMouseLeave={() =>
                        setCharacterHover((current) => (current === index ? null : current))
                      }
                      onClick={() =>
                        setDraft({
                          ...draft,
                          avatar: packAvatar(index, avatarParts(draft.avatar).color),
                        })
                      }
                    >
                      <EvaluatorMark
                        name={character.label}
                        avatar={packAvatar(index, 0)}
                        color={
                          selected ? EVALUATOR_COLORS[avatarParts(draft.avatar).color].color : null
                        }
                        state={characterHover === index ? "hover" : "idle"}
                        size={72}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 py-1">
                {EVALUATOR_COLORS.map((swatch, index) => {
                  const selected = avatarParts(draft.avatar).color === index;
                  return (
                    <button
                      key={swatch.label}
                      type="button"
                      disabled={!canEdit}
                      aria-label={swatch.label}
                      aria-pressed={selected}
                      className={`h-6 w-6 origin-center rounded-full transition-transform duration-300 ease-out ${
                        selected
                          ? "z-10 scale-150 shadow-[0_6px_12px_rgba(0,0,0,0.2)]"
                          : "scale-100"
                      }`}
                      style={{ backgroundColor: swatch.color }}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          avatar: packAvatar(avatarParts(draft.avatar).character, index),
                        })
                      }
                    />
                  );
                })}
              </div>
            </div>

            <EffortSlider
              value={draft.effort}
              disabled={!canEdit}
              onChange={(effort) => setDraft({ ...draft, effort })}
            />
          </div>
        </Card>
      ) : (
        <Card className="rounded-xl p-8 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            Select an evaluator to see its configuration.
          </p>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="This evaluator is shared"
        description="Saving a workspace evaluator changes how it reads every project in this workspace."
        confirmLabel="Save anyway"
        onConfirm={() => {
          setConfirmOpen(false);
          void persist();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${selected?.name ?? "this evaluator"}?`}
        description="Existing reports stay, labeled as general once the evaluator is gone."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!selected) return;
          try {
            await api.deleteEvaluator(selected.id);
            toast.success("Evaluator deleted");
            setSelectedId(null);
            setDraft(null);
            setCreating(false);
            await qc.invalidateQueries({ queryKey: ["group", groupId, "evaluators"] });
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      <ConfirmDialog
        open={deletePersonalityId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePersonalityId(null);
        }}
        title="Delete this personality?"
        description="Evaluators using it switch to another personality. The last one cannot be deleted."
        destructive
        confirmLabel="Delete"
        onConfirm={() => void removePersonality()}
      />
      <Dialog
        open={personalityDraft !== null}
        onOpenChange={(open) => {
          if (!open) setPersonalityDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {personalityDraft?.id ? "Edit personality" : "New personality"}
            </DialogTitle>
            <DialogDescription>
              This changes emphasis and tone. Claims still have to follow the evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="personality-name">Name</Label>
              <Input
                id="personality-name"
                value={personalityDraft?.name ?? ""}
                maxLength={40}
                onChange={(event) =>
                  setPersonalityDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personality-instruction">Instruction</Label>
              <Textarea
                id="personality-instruction"
                ref={instructionRef}
                value={personalityDraft?.instruction ?? ""}
                maxLength={800}
                rows={1}
                className="min-h-0 resize-y overflow-hidden [field-sizing:content]"
                onChange={(event) => {
                  fitInstruction(event.currentTarget);
                  setPersonalityDraft((current) =>
                    current ? { ...current, instruction: event.target.value } : current,
                  );
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPersonalityDraft(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void savePersonality()}>
              {personalityDraft?.id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
