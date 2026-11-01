import { ImagePicker } from "./ImagePicker";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FormModal } from "./FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface EntityFormValues {
  id?: string;
  name: string;
  description?: string;
  photoUrl?: string;
}

export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial?: Partial<EntityFormValues>;
  submitLabel?: string;
  onSubmit: (values: EntityFormValues) => Promise<void> | void;
}) {
  const { pathname } = useLocation();
  const route = pathname.match(/^\/organizations\/([^/]+)(?:\/workspaces\/([^/]+))?/);
  const scope = /group/i.test(title)
    ? "group"
    : /workspace/i.test(title)
      ? "workspace"
      : "organization";
  const target = initial?.id
    ? { scope, targetId: initial.id }
    : route?.[2]
      ? { scope: "workspace", targetId: route[2] }
      : route?.[1]
        ? { scope: "organization", targetId: route[1] }
        : null;
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const initialized = useRef(false);
  const [baseline, setBaseline] = useState("");
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      setBaseline(
        JSON.stringify([initial?.name ?? "", initial?.description ?? "", initial?.photoUrl ?? ""]),
      );
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setPhotoUrl(initial?.photoUrl ?? "");
    }
  }, [open, initial]);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      dirty={!!baseline && JSON.stringify([name, description, photoUrl]) !== baseline}
      title={title}
      submitLabel={submitLabel}
      submitting={submitting || uploading}
      onSubmit={async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
          await onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
            photoUrl: photoUrl.trim(),
          });
          onOpenChange(false);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ef-name">Name</Label>
        <Input
          id="ef-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ef-desc">Description</Label>
        <Textarea
          id="ef-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {target ? (
        <ImagePicker
          variant="logo"
          value={photoUrl}
          onChange={setPhotoUrl}
          target={target}
          onBusyChange={setUploading}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Create your organization, then add its logo and cover from Personalize.
        </p>
      )}
    </FormModal>
  );
}
