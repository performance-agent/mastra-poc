import { useEffect, useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { GradingSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const fields = {
  minimum: "Scale minimum",
  maximum: "Scale maximum",
  passingGrade: "Passing grade",
  minimumCoverage: "Minimum coverage (%)",
  summaryLength: "Summary characters",
  met: "Met weight",
  partially_met: "Partially met weight",
  not_met: "Not met weight",
};
type NumericKey = keyof typeof fields;
type Draft = Record<NumericKey, string> & Pick<GradingSettings, "rounding">;
const roundingLabels = {
  integer: "Whole number",
  one_decimal: "One decimal place",
  two_decimals: "Two decimal places",
  none: "No rounding",
};
function toDraft(settings: GradingSettings): Draft {
  return {
    ...Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        String(settings[key as NumericKey] * (key === "minimumCoverage" ? 100 : 1)),
      ]),
    ),
    rounding: settings.rounding,
  } as Draft;
}
function validate(draft: Draft): GradingSettings {
  const values = Object.fromEntries(
    Object.keys(fields).map((key) => {
      const value = draft[key as NumericKey];
      if (!value.trim() || !Number.isFinite(Number(value)))
        throw new Error(`${fields[key as NumericKey]} is required and must be a valid number.`);
      return [key, Number(value)];
    }),
  ) as Record<NumericKey, number>;
  if (values.maximum <= values.minimum) throw new Error("Scale maximum must exceed the minimum.");
  if (values.passingGrade < values.minimum || values.passingGrade > values.maximum)
    throw new Error("Passing grade must be within the scale.");
  if (values.minimumCoverage < 0 || values.minimumCoverage > 100)
    throw new Error("Minimum coverage must be between 0% and 100%.");
  if (
    !Number.isInteger(values.summaryLength) ||
    values.summaryLength < 40 ||
    values.summaryLength > 2000
  )
    throw new Error("Summary length must be a whole number between 40 and 2,000 characters.");
  if ([values.met, values.partially_met, values.not_met].some((v) => v < 0 || v > 1))
    throw new Error("Weights must be between 0 and 1.");
  return { ...values, minimumCoverage: values.minimumCoverage / 100, rounding: draft.rounding };
}
export function GradingControls({
  workspaceId,
  onChange,
  disabled = false,
}: {
  workspaceId: string;
  onChange: (value?: GradingSettings) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [saved, setSaved] = useState<GradingSettings>();
  const [applied, setApplied] = useState<GradingSettings>();
  const [draft, setDraft] = useState<Draft>();
  const [override, setOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .getGradingSettings(workspaceId)
      .then((value) => {
        if (active) {
          setSaved(value);
          setDraft(toDraft(value));
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, retry]);
  const effective = override ? applied : saved;
  const locked = disabled || saving || loading;
  const apply = () => {
    if (!draft) return;
    try {
      const value = validate(draft);
      setApplied(value);
      onChange(value);
      setError("");
      setMessage("Custom settings applied to this evaluation.");
    } catch (e) {
      setError(errorMessage(e));
      setMessage("");
    }
  };
  const save = async () => {
    if (!draft) return;
    setError("");
    setMessage("");
    try {
      const value = validate(draft);
      setSaving(true);
      const result = await api.saveGradingSettings(workspaceId, value);
      setSaved(result);
      setMessage(
        "Workspace defaults saved. " +
          (override
            ? "Custom settings for this evaluation remain as last applied."
            : "This evaluation will use the saved defaults."),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const field = (key: NumericKey) => (
    <div key={key} className="space-y-2">
      <Label htmlFor={`${id}-${key}`}>{fields[key]}</Label>
      <Input
        id={`${id}-${key}`}
        type="number"
        step={key === "summaryLength" ? 1 : "any"}
        min={
          key === "summaryLength"
            ? 40
            : ["minimumCoverage", "met", "partially_met", "not_met"].includes(key)
              ? 0
              : undefined
        }
        max={
          key === "summaryLength"
            ? 2000
            : key === "minimumCoverage"
              ? 100
              : ["met", "partially_met", "not_met"].includes(key)
                ? 1
                : undefined
        }
        value={draft?.[key] ?? ""}
        disabled={locked}
        onChange={(e) => {
          setDraft((current) => current && { ...current, [key]: e.target.value });
          setMessage(
            "Changes are not applied. Apply them to this evaluation or save workspace defaults.",
          );
          setError("");
        }}
      />
    </div>
  );
  return (
    <Accordion type="single" collapsible className="mb-6">
      <AccordionItem value="grading">
        <AccordionTrigger>
          <span className="space-y-1">
            <span className="block">Grading settings</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {effective
                ? `Scale ${effective.minimum}–${effective.maximum} · Pass ${effective.passingGrade} · Coverage ${Math.round(effective.minimumCoverage * 100)}%`
                : "Workspace grading defaults"}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          {loading && <p role="status">Loading grading settings…</p>}
          {!loading && !saved && (
            <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
              Retry loading settings
            </Button>
          )}
          {draft && saved && (
            <>
              <div className="flex items-start gap-3">
                <Switch
                  id={`${id}-override`}
                  checked={override}
                  disabled={locked}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      try {
                        const value = validate(draft);
                        setApplied(value);
                        onChange(value);
                      } catch (e) {
                        setError(errorMessage(e));
                        return;
                      }
                    } else {
                      onChange(undefined);
                      setDraft(toDraft(saved));
                    }
                    setOverride(checked);
                    setError("");
                    setMessage(
                      checked
                        ? "Custom settings applied to this evaluation."
                        : "This evaluation will use saved workspace defaults.",
                    );
                  }}
                />
                <Label htmlFor={`${id}-override`} className="leading-5">
                  Use custom settings for this evaluation
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {override
                  ? "Apply edits below to update this evaluation’s custom settings."
                  : "Evaluations use saved workspace defaults. Editing fields alone does not change them."}
              </p>
              <fieldset className="space-y-3">
                <legend className="mb-3 font-medium">Scale and passing requirements</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["minimum", "maximum", "passingGrade", "minimumCoverage"] as const).map(field)}
                </div>
                <Label htmlFor={`${id}-rounding`}>Rounding</Label>
                <Select
                  value={draft.rounding}
                  disabled={locked}
                  onValueChange={(value) => {
                    setDraft({ ...draft, rounding: value as GradingSettings["rounding"] });
                    setMessage("Changes are not applied. Apply or save them below.");
                    setError("");
                  }}
                >
                  <SelectTrigger id={`${id}-rounding`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roundingLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </fieldset>
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced">
                  <AccordionTrigger>Advanced options</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(["met", "partially_met", "not_met", "summaryLength"] as const).map(field)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="flex flex-wrap gap-2">
                {override && (
                  <Button disabled={locked} onClick={apply}>
                    Apply to this evaluation
                  </Button>
                )}
                <Button variant="outline" disabled={locked} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save workspace defaults"}
                </Button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
