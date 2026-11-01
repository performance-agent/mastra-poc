import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ConfirmDialog } from "./ConfirmDialog";
export function useUnsavedDialog(
  open: boolean,
  dirty: boolean,
  onOpenChange: (v: boolean) => void,
  busy = false,
) {
  const [confirm, setConfirm] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => open && dirty,
    enableBeforeUnload: open && dirty,
    withResolver: true,
  });
  const changeOpen = (next: boolean) => {
    if (busy) return;
    if (!next && dirty) setConfirm(true);
    else onOpenChange(next);
  };
  const confirmation = (
    <ConfirmDialog
      open={confirm || blocker.status === "blocked"}
      onOpenChange={(v) => {
        setConfirm(v);
        if (!v) blocker.reset?.();
      }}
      title="Discard unsaved changes?"
      description="Saved progress will stay. Only your pending edits will be discarded."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => {
        setConfirm(false);
        onOpenChange(false);
        blocker.proceed?.();
      }}
    />
  );
  return { changeOpen, confirmation };
}
