import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { api, errorMessage } from "@/lib/api";
import type { Group } from "@/lib/types";
import {
  EVALUATION_EMPHASIS_VALUES,
  EMPHASIS_LABELS,
  EMPHASIS_DESCRIPTIONS,
  CONFLICTING_EVIDENCE_PAIR,
  MAX_EMPHASIS_COUNT,
  MAX_NOTES_LENGTH,
  type EvaluationEmphasis,
} from "@/lib/evaluation-guidelines";

interface Props {
  group: Group;
  canEdit: boolean;
  onSaved: (updated: Group) => void;
}

export function EvaluationGuidelinesCard({ group, canEdit, onSaved }: Props) {
  const [emphasis, setEmphasis] = useState<EvaluationEmphasis[]>(
    (group.evaluationEmphasis ?? []) as EvaluationEmphasis[],
  );
  const [notes, setNotes] = useState(group.evaluationNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmphasis((group.evaluationEmphasis ?? []) as EvaluationEmphasis[]);
    setNotes(group.evaluationNotes ?? "");
  }, [group.id, group.evaluationEmphasis, group.evaluationNotes]);

  const conflictingOf = (value: EvaluationEmphasis): EvaluationEmphasis | null => {
    if (value === CONFLICTING_EVIDENCE_PAIR[0]) return CONFLICTING_EVIDENCE_PAIR[1];
    if (value === CONFLICTING_EVIDENCE_PAIR[1]) return CONFLICTING_EVIDENCE_PAIR[0];
    return null;
  };

  const toggleEmphasis = (value: EvaluationEmphasis) => {
    if (!canEdit) return;
    setEmphasis((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }
      const conflict = conflictingOf(value);
      const withoutConflict = conflict ? prev.filter((v) => v !== conflict) : prev;
      if (withoutConflict.length >= MAX_EMPHASIS_COUNT) return prev;
      return [...withoutConflict, value];
    });
  };

  const isDisabled = (value: EvaluationEmphasis): boolean => {
    if (emphasis.includes(value)) return false;
    const conflict = conflictingOf(value);
    if (conflict && emphasis.includes(conflict)) return true;
    return emphasis.length >= MAX_EMPHASIS_COUNT;
  };

  const isDirty =
    JSON.stringify([...(group.evaluationEmphasis ?? [])].sort()) !==
      JSON.stringify([...emphasis].sort()) || (group.evaluationNotes ?? "") !== notes;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateGroup(group.id, {
        evaluationEmphasis: emphasis,
        evaluationNotes: notes.trim() || undefined,
      });
      toast.success("Evaluation guidelines saved");
      onSaved(updated);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEmphasis((group.evaluationEmphasis ?? []) as EvaluationEmphasis[]);
    setNotes(group.evaluationNotes ?? "");
  };

  return (
    <Card className="min-w-0 overflow-hidden rounded-xl p-4 shadow-card sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Evaluation guidelines</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Steer the next Project Report by telling the AI what matters most for this project.
              These guidelines do not add sections or change the score scale — they influence how
              evidence is interpreted and which metrics are highlighted.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Emphasis — select up to {MAX_EMPHASIS_COUNT}
            </Label>
            <div className="flex flex-wrap gap-2">
              {EVALUATION_EMPHASIS_VALUES.map((value) => {
                const active = emphasis.includes(value);
                const disabled = !canEdit || (!active && isDisabled(value));
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleEmphasis(value)}
                    title={EMPHASIS_DESCRIPTIONS[value]}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-accent",
                      disabled && !active ? "cursor-not-allowed opacity-40" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {EMPHASIS_LABELS[value]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eval-notes" className="text-xs font-medium text-muted-foreground">
              Notes{" "}
              <span className="font-normal">
                (optional — vision, exceptions, what "good" looks like for this team)
              </span>
            </Label>
            {canEdit ? (
              <Textarea
                id="eval-notes"
                rows={4}
                maxLength={MAX_NOTES_LENGTH}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`Examples:\n• "Platform team — small reviewed PRs matter more than volume"\n• "Jira is outdated; weigh GitHub commits more heavily"\n• "We're in a discovery phase; ticket ideation signals outweigh delivery metrics"`}
                className="resize-none text-sm"
              />
            ) : (
              <p className="min-h-15 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {notes || <span className="italic opacity-60">No notes configured</span>}
              </p>
            )}
            {canEdit && notes.length > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                {notes.length} / {MAX_NOTES_LENGTH}
              </p>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end gap-2">
              {isDirty && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  Discard
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? "Saving…" : "Save guidelines"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
