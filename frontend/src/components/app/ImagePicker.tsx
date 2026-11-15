import { Avatar } from "./Avatar";
import { Slider } from "@/components/ui/slider";
import { flushSync } from "react-dom";
import { FormDraftContext } from "./form-draft";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage, useImageSource } from "@/lib/media";
import { toast } from "sonner";

export function ImagePicker({
  value,
  onChange,
  target,
  variant = "photo",
  onBusyChange,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  target: { scope: string; targetId: string };
  variant?: "photo" | "logo" | "cover";
  onBusyChange?: (busy: boolean) => void;
}) {
  const cover = variant === "cover";
  const label = variant === "photo" ? "photo" : variant;
  const form = useContext(FormDraftContext);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const isAvatar = value?.startsWith("avatar:") ?? false;
  const source = useImageSource(isAvatar ? undefined : value);
  const [draft, setDraft] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState(50);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const disabled = busy || !target.targetId;
  const reportError = (message: string) => {
    setError(message);
    toast.error(message);
  };
  const select = (file?: File) => {
    if (!file || disabled) return;
    setError(null);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      reportError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    const reader = new FileReader();
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > 40000000) {
        reportError("Choose an image smaller than 40 megapixels.");
        return;
      }
      setDraft(image);
      setZoom(1);
      setPosition(50);
    };
    image.onerror = () => {
      reportError("This image could not be opened.");
    };
    reader.onerror = () => reportError("This file could not be read. Try again.");
    reader.onload = () => {
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const upload = async () => {
    if (!draft) return;
    setError(null);
    setBusy(true);
    onBusyChange?.(true);
    setProgress(0);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = cover ? 1600 : 512;
      canvas.height = cover ? 500 : 512;
      const ratio =
        Math.max(canvas.width / draft.naturalWidth, canvas.height / draft.naturalHeight) * zoom;
      const width = draft.naturalWidth * ratio,
        height = draft.naturalHeight * ratio;
      const context = canvas.getContext("2d")!;
      context.drawImage(
        draft,
        (canvas.width - width) / 2,
        ((canvas.height - height) * position) / 100,
        width,
        height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not prepare image"))),
          "image/webp",
          0.9,
        ),
      );
      const next = await uploadImage(
        blob,
        { ...target, purpose: cover ? "cover" : "photo" },
        setProgress,
      );
      flushSync(() => onChange(next));
      setDraft(null);
    } catch (error) {
      reportError(error instanceof Error ? error.message : "Upload failed");
      throw error;
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  const register = form?.register;
  useEffect(() => {
    register?.(inputId, draft ? () => uploadRef.current() : null);
    return () => register?.(inputId, null);
  }, [register, inputId, draft]);
  const shape = variant === "photo" ? "rounded-full" : "rounded-xl";
  return (
    <div
      className={`space-y-3 rounded-xl transition-shadow ${dragging ? "bg-[var(--brand-soft)] ring-2 ring-[var(--brand)]" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !event.currentTarget.closest("fieldset:disabled")) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!event.currentTarget.closest("fieldset:disabled")) select(event.dataTransfer.files[0]);
      }}
    >
      <div className={cover ? "space-y-2" : "flex items-center gap-4"}>
        {draft ? (
          <div
            className={`shrink-0 overflow-hidden bg-muted ${shape}`}
            style={{ width: cover ? "100%" : 112, aspectRatio: cover ? "3.2" : "1" }}
          >
            <img
              src={draft.src}
              alt="Crop preview"
              className="h-full w-full object-cover"
              style={{
                objectPosition: `50% ${position}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `50% ${position}%`,
              }}
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            aria-label={`${value ? "Change" : "Upload"} ${label}`}
            aria-describedby={`${inputId}-hint`}
            disabled={disabled}
            onClick={() => input.current?.click()}
            className={`group relative shrink-0 p-0 hover:bg-transparent ${cover ? "h-auto w-full rounded-xl" : `h-20 w-20 ${shape}`}`}
            style={cover ? { aspectRatio: "3.2" } : undefined}
          >
            <span
              className={`flex h-full w-full items-center justify-center overflow-hidden border border-border bg-muted/50 ${shape}`}
            >
              {isAvatar ? (
                <Avatar
                  name=""
                  src={value}
                  className="h-full w-full rounded-none border-0 [&_svg]:size-10"
                />
              ) : source ? (
                <img src={source} alt={`${label} preview`} className="h-full w-full object-cover" />
              ) : variant === "photo" ? (
                <UserRound className="size-7 text-muted-foreground" />
              ) : (
                <ImagePlus className="size-7 text-muted-foreground" />
              )}
            </span>
            <span
              className={`absolute flex items-center justify-center gap-2 border border-border bg-background text-foreground shadow-sm transition-colors group-hover:bg-accent ${cover ? "bottom-3 right-3 rounded-lg px-3 py-2 text-xs font-medium" : "-bottom-1 -right-1 size-8 rounded-full"}`}
            >
              <Camera className="size-4" />
              {cover && <span>{value ? "Change cover" : "Add cover"}</span>}
            </span>
          </Button>
        )}
        <div className="min-w-0 space-y-1">
          {!cover && (
            <p className="text-sm font-medium">
              {draft ? "Adjust your" : value ? "Change" : "Upload"} {label}
            </p>
          )}
          <p id={`${inputId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
            {dragging ? "Drop your image here" : "JPEG, PNG or WebP. Up to 5 MB."}
          </p>
          {value && !draft && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove image"
              className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => {
                setError(null);
                onChange("");
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        id={inputId}
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose image"
        disabled={disabled}
        onChange={(event) => {
          select(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {draft && (
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-xs">
            <span className="w-14 shrink-0">Zoom</span>
            <Slider
              aria-label="Crop zoom"
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              className="flex-1"
              disabled={disabled}
            />
          </label>
          <label className="flex items-center gap-3 text-xs">
            <span className="w-14 shrink-0">Position</span>
            <Slider
              aria-label="Crop vertical position"
              min={0}
              max={100}
              value={[position]}
              onValueChange={([value]) => setPosition(value)}
              className="flex-1"
              disabled={disabled}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {!form && (
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => void upload().catch(() => {})}
              >
                {busy ? `Uploading ${progress}%` : "Use this crop"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="-ml-2"
              disabled={disabled}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel adjustment
            </Button>
            {form && (
              <p className="text-xs text-muted-foreground">Applied when you save changes.</p>
            )}
          </div>
        </div>
      )}
      {busy && (
        <progress className="w-full" max={100} value={progress} aria-label="Upload progress" />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
