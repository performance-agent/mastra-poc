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
export type Setup = {
  version: 1;
  step: number;
  workspaceId: string;
  groupId: string;
  evaluatorId: string;
  dismissed: boolean;
  seen?: boolean;
  completed?: boolean;
  skipped?: number[];
};
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
  version: 1,
  step: 0,
  workspaceId: "",
  groupId: "",
  evaluatorId: "",
  dismissed: false,
};
