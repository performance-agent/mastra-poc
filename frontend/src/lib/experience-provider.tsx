import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PREFERENCES,
  type Appearance,
  type Preferences,
} from "./experience";

import { Context, type Experience } from "./experience-context";
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { firebaseUser } = useAuth();
  const qc = useQueryClient();
  const preferenceWrites = useRef<Record<string, Promise<void>>>({});
  const uid = firebaseUser?.uid;
  const organizationId = location.pathname.match(/^\/organizations\/([^/]+)/)?.[1] || undefined;
  const profile = useQuery({
    queryKey: ["experience", uid, "profile"],
    queryFn: api.me,
    enabled: !!uid,
  });
  const personal = useQuery({
    queryKey: ["experience", uid, "personal"],
    queryFn: () => api.preferences(),
    enabled: !!uid,
  });
  const preferences = useQuery({
    queryKey: ["experience", uid, organizationId, "preferences"],
    queryFn: () => api.preferences(organizationId),
    enabled: !!uid && !!organizationId,
  });
  const appearance = useQuery({
    queryKey: ["experience", uid, organizationId, "appearance"],
    queryFn: () => api.appearance(organizationId!),
    enabled: !!uid && !!organizationId,
  });
  useEffect(() => {
    if (organizationId && profile.data && appearance.data) {
      try {
        localStorage.setItem("platformance:last-org:" + profile.data.id, organizationId);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [organizationId, profile.data, appearance.data]);
  const settings = personal.data ?? DEFAULT_PREFERENCES;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        settings.theme === "dark" || (settings.theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    document.documentElement.dataset.motion = settings.motion;
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.motion]);
  useEffect(() => {
    const color = appearance.data?.color ?? DEFAULT_APPEARANCE.color;
    document.documentElement.style.setProperty("--brand", color);
    const rgb = color
      .slice(1)
      .match(/.{2}/g)!
      .map((v) => {
        const n = parseInt(v, 16) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    document.documentElement.style.setProperty(
      "--brand-contrast",
      luminance > 0.179 ? "#000000" : "#ffffff",
    );
    return () => {
      document.documentElement.style.removeProperty("--brand");
    };
  }, [appearance.data?.color]);
  const value = useMemo<Experience>(
    () => ({
      organizationId,
      profile: profile.data,
      appearance: appearance.data ?? DEFAULT_APPEARANCE,
      preferences: preferences.data ?? DEFAULT_PREFERENCES,
      personal: settings,
      ready:
        !!profile.data &&
        !!personal.data &&
        (!organizationId || (!!preferences.data && !!appearance.data)),
      error: profile.error || personal.error || preferences.error || appearance.error,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ["experience", uid] });
      },
      savePreferences: async (next, global = false) => {
        const scope = global ? undefined : organizationId;
        const key = global
          ? ["experience", uid, "personal"]
          : ["experience", uid, organizationId, "preferences"];
        const baseline = qc.getQueryData<Preferences>(key) ?? DEFAULT_PREFERENCES;
        const changes = Object.fromEntries(
          Object.entries(next).filter(
            ([field, value]) =>
              JSON.stringify(value) !== JSON.stringify(baseline[field as keyof Preferences]),
          ),
        ) as Partial<Preferences>;
        const queueKey = JSON.stringify(key);
        // A visit and a star click may overlap. Merge only the changed fields
        // after earlier writes, so recent history cannot overwrite favorites.
        const write = (preferenceWrites.current[queueKey] ?? Promise.resolve())
          .catch(() => {})
          .then(async () => {
            const current = qc.getQueryData<Preferences>(key) ?? DEFAULT_PREFERENCES;
            const saved = await api.savePreferences({ ...current, ...changes }, scope);
            qc.setQueryData(key, saved);
          });
        preferenceWrites.current[queueKey] = write;
        await write;
      },
    }),
    [
      organizationId,
      profile.data,
      profile.error,
      appearance.data,
      appearance.error,
      preferences.data,
      preferences.error,
      personal.data,
      personal.error,
      settings,
      qc,
      uid,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
