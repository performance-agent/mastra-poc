import { useEffect, useRef, useState } from "react";

import { EvaluatorMark } from "@/components/app/EvaluatorMark";
import type { LeafStatus, TreeController, TreeProgressDetail } from "@/lib/tree-growth";
import "@/lib/tree-growth.js";

const PHASES = ["evidence", "rules", "judgment", "crown"] as const;

export type TreePhase = "idle" | "evidence" | "rules" | "judgment" | "done" | "failed";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function rank(phase: TreePhase) {
  if (phase === "evidence") return 1;
  if (phase === "rules") return 2;
  if (phase === "judgment") return 3;
  if (phase === "done" || phase === "failed") return 4;
  return 0;
}

export function leafFor(verdicts: LeafStatus[], index: number): LeafStatus {
  if (verdicts.length <= 5 || index < 4) return verdicts[index] ?? "no-data";
  const rest = verdicts.slice(4);
  return (
    (["fail", "partial", "no-data", "pass"] as const).find((status) => rest.includes(status)) ??
    "no-data"
  );
}

function paintLeaves(tree: TreeController, verdicts: LeafStatus[]) {
  tree.model.branches.forEach((_, index) => {
    const fill = tree.svg.querySelector(`[data-fill="${index}"] path`);
    const color = window.TreeGrowth?.colors[leafFor(verdicts, index)];
    if (fill && color) fill.setAttribute("fill", color);
  });
}

export function EvaluationTree({
  ruleLabels,
  phase,
  verdicts,
  failAt,
  status,
}: {
  ruleLabels: string[];
  phase: TreePhase;
  verdicts: LeafStatus[];
  failAt: "evidence" | "rules" | "judgment" | "crown" | null;
  status: string;
}) {
  const desired = useRef({ phase, verdicts, failAt });
  desired.current = { phase, verdicts, failAt };
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [activePhase, setActivePhase] = useState("idle");
  const [labelState, setLabelState] = useState<Record<string, string>>({});
  const [character, setCharacter] = useState<"thinking" | "generating">("generating");
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsKey = ruleLabels.join("\n");
  const labelsRef = useRef(ruleLabels);
  labelsRef.current = ruleLabels;

  useEffect(() => {
    const ruleLabels = labelsRef.current;
    const host = hostRef.current;
    const api = window.TreeGrowth;
    if (!host || !api || ruleLabels.length === 0) return;
    const tree = new api.Controller(
      host,
      {
        rules: ruleLabels.map((label) => ({ label, status: "no-data" as const })),
        duration: 500,
      },
    );
    let cancelled = false;
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<TreeProgressDetail>).detail;
      setAnchor(detail.anchor ?? null);
      if (detail.phase) setActivePhase(detail.phase);
      setCharacter(detail.phase === "judgment" ? "thinking" : "generating");
      const order = PHASES.indexOf(detail.phase as (typeof PHASES)[number]);
      setLabelState(() => {
        const next: Record<string, string> = {};
        PHASES.forEach((item, index) => {
          next[item] =
            detail.phase === "ready" || (order >= 0 && index < order)
              ? "complete"
              : index === order
                ? detail.failed
                  ? "failed"
                  : "active"
                : "pending";
        });
        return next;
      });
    };
    tree.addEventListener("progress", onProgress);

    const loop = async () => {
      let step = 0;
      while (!cancelled) {
        const current = desired.current;
        if (current.phase === "idle") {
          await sleep(200);
          continue;
        }
        if (step < 1) {
          const stop = current.failAt === "evidence";
          await tree.evidence({ failAt: stop ? "root-1" : null });
          if (cancelled || stop) return;
          step = 1;
        }
        if (rank(current.phase) < 2) {
          await sleep(200);
          continue;
        }
        if (step < 2) {
          if (!(await tree.growTrunk({ fail: current.failAt === "rules" }))) return;
          for (let index = 0; index < tree.model.branches.length; index += 1) {
            if (cancelled) return;
            if (!(await tree.interpretRule(index))) return;
          }
          step = 2;
        }
        if (rank(current.phase) < 3) {
          await sleep(200);
          continue;
        }
        if (step < 3) {
          for (let index = 0; index < tree.model.branches.length; index += 1) {
            if (cancelled) return;
            const fail = current.failAt === "judgment" && index === 0;
            if (!(await tree.judgeRule(index, leafFor(current.verdicts, index), { fail }))) return;
          }
          paintLeaves(tree, desired.current.verdicts);
          step = 3;
        }
        if (current.phase === "failed") return;
        if (current.phase !== "done") {
          await sleep(200);
          continue;
        }
        paintLeaves(tree, desired.current.verdicts);
        await tree.finish({ fail: desired.current.failAt === "crown" });
        return;
      }
    };
    void loop();
    return () => {
      cancelled = true;
      tree.removeEventListener("progress", onProgress);
      tree.dispose();
    };
  }, [labelsKey]);

  useEffect(() => {
    const tree = hostRef.current?.querySelector("svg");
    if (!tree || verdicts.length === 0) return;
    verdicts.forEach((_, index) => {
      const fill = tree.querySelector(`[data-fill="${index}"] path`);
      const color = window.TreeGrowth?.colors[leafFor(verdicts, index)];
      if (fill && color) fill.setAttribute("fill", color);
    });
  }, [verdicts]);

  const showCharacter =
    Boolean(anchor) && phase !== "idle" && phase !== "done" && phase !== "failed" && activePhase !== "ready";

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E9ECEA] bg-white">
      <div className="relative aspect-[640/420]">
        <div ref={hostRef} className="absolute inset-0 [&_svg]:h-full [&_svg]:w-full" />
        <div className="pointer-events-none absolute inset-0" aria-label="Evaluation steps">
          {(
            [
              ["evidence", "Evidence", "87%"],
              ["rules", "Rules", "61%"],
              ["judgment", "Judgment", "30%"],
              ["crown", "Done", "12%"],
            ] as const
          ).map(([key, label, top]) => (
            <span
              key={key}
              className={`absolute left-[4%] -translate-y-1/2 text-sm ${
                labelState[key] === "active"
                  ? "font-medium text-[#008D7F]"
                  : labelState[key] === "complete"
                    ? "text-[#242A27]"
                    : labelState[key] === "failed"
                      ? "text-[#B74444]"
                      : "text-[#7B8680]"
              }`}
              style={{ top }}
            >
              {label}
            </span>
          ))}
        </div>
        {showCharacter && anchor && (
          <div
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${(Math.min(600, anchor.x + 36) / 640) * 100}%`,
              top: `${(Math.max(24, anchor.y - 24) / 420) * 100}%`,
            }}
          >
            <EvaluatorMark name="Rules" avatar={41} state={character} size={36} />
          </div>
        )}
      </div>
      <p className="border-t border-[#E9ECEA] px-4 py-3 text-sm text-[#64716a]" role="status">
        {status}
        {ruleLabels.length > 5 ? " The fifth branch groups the rest." : ""}
      </p>
    </div>
  );
}
