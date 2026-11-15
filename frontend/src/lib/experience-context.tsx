import { createContext, useContext } from "react";
import type { Appearance, Preferences, Shortcut } from "./experience";
import type { User } from "./types";
export type Experience = {
  organizationId?: string;
  profile?: User;
  appearance: Appearance;
  preferences: Preferences;
  personal: Preferences;
  ready: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  savePreferences: (value: Preferences, personal?: boolean) => Promise<void>;
};
export const Context = createContext<Experience | null>(null);
export function useExperience() {
  const context = useContext(Context);
  if (!context) throw new Error("ExperienceProvider is missing");
  return context;
}
export function shortcutUrl(org: string, item: Shortcut) {
  return `/organizations/${encodeURIComponent(org)}/workspaces/${encodeURIComponent(item.workspaceId)}${item.kind === "group" ? `/groups/${encodeURIComponent(item.id)}` : ""}`;
}
