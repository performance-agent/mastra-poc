export const BLOCKS = ["setup", "welcome", "favorites", "recent", "evaluations"] as const;
export type Block = (typeof BLOCKS)[number];
export const BLOCK_LABELS: Record<Block, string> = {
  welcome: "Welcome",
  favorites: "Your shortcuts",
  recent: "Recently visited",
  evaluations: "Recent evaluations",
  setup: "Getting started",
};
export type Shortcut = {
  kind: "workspace" | "group";
  id: string;
  workspaceId: string;
  name: string;
};
export type Preferences = {
  version: 1;
  theme: "system" | "light" | "dark";
  motion: "system" | "reduced";
  blocks: Block[] | null;
  favorites: Shortcut[];
  recent: Shortcut[];
};
export type Appearance = {
  version: 1;
  color: string;
  cover: string;
  blocks: Block[];
  canEdit?: boolean;
};
export const SETUP_STEPS = ["welcome", "team", "plugins", "evaluator", "review"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export type SetupEvaluatorDraft = {
  baseId: string;
  name: string;
  description: string;
  avatar: number;
  personalityId: string;
  effort: "LOW" | "MEDIUM" | "HIGH";
  evaluationEmphasis: string[];
  evaluationNotes: string;
  rules: Array<{ name: string; description: string; valuation: number }>;
  questions: Array<{ text: string }>;
};
export type Setup = {
  version: 2;
  step: SetupStep;
  workspaceId: string;
  groupId: string;
  evaluatorId: string;
  dismissed: boolean;
  seen: boolean;
  completed: boolean;
  skipped: SetupStep[];
  teamDraft: {
    creating: boolean;
    workspaceName: string;
    groupName: string;
    description: string;
    invitations: string[];
  };
  resourceIds: string[];
  resourcesInitialized: boolean;
  evaluatorDraft: SetupEvaluatorDraft | null;
  period: { preset: "7" | "30" | "90" | "custom"; from?: string; to?: string };
};
export function normalizeSetup(value: unknown): Setup {
  const raw = (value ?? {}) as Partial<Setup>;
  if (raw.version === 2) return { ...structuredClone(DEFAULT_SETUP), ...raw } as Setup;
  const legacy = raw as unknown as {
    step?: number;
    seen?: boolean;
    dismissed?: boolean;
    workspaceId?: string;
    skipped?: number[];
  };
  return {
    ...structuredClone(DEFAULT_SETUP),
    ...raw,
    version: 2,
    step:
      !legacy.step && !legacy.seen && !legacy.dismissed
        ? "welcome"
        : SETUP_STEPS[Math.max(1, legacy.step ?? 0)],
    skipped: (legacy.skipped ?? []).map((step) => SETUP_STEPS[Math.max(1, step)]),
    teamDraft: { ...DEFAULT_SETUP.teamDraft, creating: !legacy.workspaceId },
  } as Setup;
}
export function setupUrl(org: string, step: SetupStep) {
  return "/organizations/" + encodeURIComponent(org) + "/setup/" + step;
}
export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  theme: "system",
  motion: "system",
  blocks: null,
  favorites: [],
  recent: [],
};
export const DEFAULT_APPEARANCE: Appearance = {
  version: 1,
  color: "#7262d9",
  cover: "",
  blocks: [...BLOCKS],
};
export const DEFAULT_SETUP: Setup = {
  version: 2,
  step: "welcome",
  workspaceId: "",
  groupId: "",
  evaluatorId: "",
  dismissed: false,
  seen: false,
  completed: false,
  skipped: [],
  teamDraft: { creating: true, workspaceName: "", groupName: "", description: "", invitations: [] },
  resourceIds: [],
  resourcesInitialized: false,
  evaluatorDraft: null,
  period: { preset: "30" },
};
