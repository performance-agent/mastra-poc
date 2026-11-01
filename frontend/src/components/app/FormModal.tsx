import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { FormDraftContext } from "./form-draft";
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Save",
  onSubmit,
  submitting,
  children,
  contentClassName,
  dirty,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  submitting?: boolean;
  children: React.ReactNode;
  contentClassName?: string;
  dirty?: boolean;
  onSubmit: () => void | Promise<void>;
}) {
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(0);
  const uploads = useRef(new Map<string, () => Promise<void>>());
  const latestSubmit = useRef(onSubmit);
  latestSubmit.current = onSubmit;
  const changed = open && ((dirty ?? touched) || pending > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => changed && !submitting && !uploading,
    enableBeforeUnload: changed,
    withResolver: true,
  });
  useEffect(() => {
    if (!open) {
      setTouched(false);
      setConfirm(false);
      uploads.current.clear();
      setPending(0);
    }
  }, [open]);
  const close = (next: boolean) => {
    if (submitting || uploading) return;
    if (!next && changed) setConfirm(true);
    else onOpenChange(next);
  };
  const register = useRef((id: string, upload: (() => Promise<void>) | null) => {
    if (upload) uploads.current.set(id, upload);
    else uploads.current.delete(id);
    setPending(uploads.current.size);
  }).current;
  return (
    <FormDraftContext.Provider value={{ register }}>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className={cn("sm:max-w-md", contentClassName)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form
            onChangeCapture={() => setTouched(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setUploading(true);
                try {
                  for (const upload of [...uploads.current.values()]) await upload();
                  await latestSubmit.current();
                } catch {
                  /* The field or form reports the error and retains its draft. */
                } finally {
                  setUploading(false);
                }
              })();
            }}
            className="space-y-4"
          >
            <fieldset disabled={submitting || uploading} className="min-w-0 space-y-3">
              {children}
            </fieldset>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting || uploading}
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || uploading}>
                {submitting || uploading ? "Saving..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm || blocker.status === "blocked"}
        onOpenChange={(v) => {
          if (!v) {
            setConfirm(false);
            blocker.reset?.();
          }
        }}
        title="Discard unsaved changes?"
        description="Your changes have not been saved."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirm(false);
          setTouched(false);
          onOpenChange(false);
          blocker.proceed?.();
        }}
      />
    </FormDraftContext.Provider>
  );
}
