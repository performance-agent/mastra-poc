import { useEffect, useState } from "react";
import { FormModal } from "./FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface EntityFormValues {
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setPhotoUrl(initial?.photoUrl ?? "");
    }
  }, [open, initial]);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      submitLabel={submitLabel}
      submitting={submitting}
      onSubmit={async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
          await onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
            photoUrl: photoUrl.trim() || undefined,
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
      <div className="space-y-1.5">
        <Label htmlFor="ef-photo">Photo URL</Label>
        <Input
          id="ef-photo"
          type="url"
          placeholder="https://…"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
        />
      </div>
    </FormModal>
  );
}
