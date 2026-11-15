import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { DEFAULT_SETUP, normalizeSetup, type Setup } from "@/lib/experience";

export function useSetupDraft(org: string, userId?: string, transientDirty = false) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Setup>(() => structuredClone(DEFAULT_SETUP));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const latest = useRef(draft);
  const baseline = useRef("");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const currentLoad = ++loadId.current;
    setLoadFailed(false);
    try {
      const value = normalizeSetup(await api.setup(org));
      if (!mounted.current || currentLoad !== loadId.current) return;
      baseline.current = JSON.stringify(value);
      latest.current = value;
      setDraft(value);
      setReady(true);
      setError("");
    } catch (caught) {
      if (mounted.current) {
        setLoadFailed(true);
        setError(errorMessage(caught));
      }
    }
  }, [org]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, [load]);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        const value = structuredClone(latest.current);
        const serialized = JSON.stringify(value);
        if (serialized === baseline.current) return;
        if (mounted.current) {
          setSaving(true);
          setError("");
        }
        try {
          await api.saveSetup(org, value);
          baseline.current = serialized;
          qc.setQueryData(["setup", userId, org], value);
        } catch (caught) {
          if (mounted.current) setError(errorMessage(caught));
          throw caught;
        } finally {
          if (mounted.current) setSaving(false);
        }
      });
    queue.current = task;
    await task;
  }, [org, userId, qc]);
  const change = useCallback(
    (patch: Partial<Setup> | ((current: Setup) => Setup)) => {
      const next =
        typeof patch === "function" ? patch(latest.current) : { ...latest.current, ...patch };
      latest.current = next;
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => {}), 600);
    },
    [flush],
  );
  const isDirty = () => ready && JSON.stringify(latest.current) !== baseline.current;
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      transientDirty ||
      (isDirty() && !next.pathname.startsWith(`/organizations/${encodeURIComponent(org)}/setup/`)),
    enableBeforeUnload: () => transientDirty || isDirty(),
    withResolver: true,
  });
  return {
    draft,
    latest,
    ready,
    error,
    saving,
    change,
    flush,
    load,
    loadFailed,
    dirty: isDirty(),
    blocker,
  };
}
