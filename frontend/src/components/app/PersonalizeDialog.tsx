import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Palette,
  UserRound,
  LayoutDashboard,
  Building2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormModal } from "./FormModal";
import { ImagePicker } from "./ImagePicker";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExperience } from "@/lib/experience-context";
import { api, errorMessage } from "@/lib/api";
import { BLOCKS, BLOCK_LABELS, DEFAULT_APPEARANCE, type Block } from "@/lib/experience";

export function BlockEditor({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (value: Block[]) => void;
}) {
  const [dragged, setDragged] = useState<Block | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {[...value, ...BLOCKS.filter((block) => !value.includes(block))].map((block) => {
        const index = value.indexOf(block);
        return (
          <div
            key={block}
            draggable={index >= 0}
            onDragStart={() => setDragged(block)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged && index >= 0) move(value.indexOf(dragged), index);
              setDragged(null);
            }}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
            <label className="flex flex-1 items-center gap-3 text-sm">
              <Checkbox
                aria-label={BLOCK_LABELS[block]}
                checked={index >= 0}
                onCheckedChange={(checked) =>
                  onChange(checked === true ? [...value, block] : value.filter((b) => b !== block))
                }
              />
              {BLOCK_LABELS[block]}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move ${BLOCK_LABELS[block]} up`}
              disabled={index <= 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move ${BLOCK_LABELS[block]} down`}
              disabled={index < 0 || index >= value.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
export function PersonalizeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const experience = useExperience();
  const { organizationId, profile } = experience;
  const qc = useQueryClient();
  const org = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId!),
    enabled: open && !!organizationId,
  });
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [logo, setLogo] = useState("");
  const [personal, setPersonal] = useState(experience.personal);
  const [preferences, setPreferences] = useState(experience.preferences);
  const [appearance, setAppearance] = useState(experience.appearance);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const initialized = useRef(false);
  const [baseline, setBaseline] = useState("");
  const snapshot = JSON.stringify({ name, photo, logo, personal, preferences, appearance });
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setBaseline("");
      return;
    }
    if (initialized.current || !experience.ready || (organizationId && !org.data)) return;
    initialized.current = true;
    const next = {
      name: profile?.name ?? "",
      photo: profile?.photoUrl ?? "",
      logo: org.data?.photoUrl ?? "",
      personal: experience.personal,
      preferences: experience.preferences,
      appearance: experience.appearance,
    };
    setName(next.name);
    setPhoto(next.photo);
    setLogo(next.logo);
    setPersonal(next.personal);
    setPreferences(next.preferences);
    setAppearance(next.appearance);
    setBaseline(JSON.stringify(next));
  }, [
    open,
    experience.ready,
    organizationId,
    org.data,
    profile,
    experience.personal,
    experience.preferences,
    experience.appearance,
  ]);
  const save = async () => {
    if (!experience.ready || !baseline) return;
    if (appearance.canEdit && !/^#[0-9a-f]{6}$/i.test(appearance.color)) {
      toast.error("Enter a valid six-digit hex color before saving.");
      return;
    }
    setBusy(true);
    try {
      const branding = {
        version: appearance.version,
        color: appearance.color,
        cover: appearance.cover,
        blocks: appearance.blocks,
      };
      const original = JSON.parse(baseline) as {
        name: string;
        photo: string;
        logo: string;
        personal: typeof personal;
        preferences: typeof preferences;
        appearance: typeof appearance;
      };
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      await api.savePersonalization({
        ...(!same([name, photo], [original.name, original.photo])
          ? { profile: { name, photoUrl: photo || null } }
          : {}),
        ...(!same(personal, original.personal)
          ? { personal: { theme: personal.theme, motion: personal.motion } }
          : {}),
        ...(organizationId
          ? {
              organizationId,
              home: {
                ...(!same(preferences.blocks, original.preferences.blocks)
                  ? { blocks: preferences.blocks }
                  : {}),
                ...(!same(preferences.favorites, original.preferences.favorites)
                  ? { favorites: preferences.favorites }
                  : {}),
              },
            }
          : {}),
        ...(organizationId &&
        appearance.canEdit &&
        (!same(appearance, original.appearance) || logo !== original.logo)
          ? { organization: { appearance: branding, photoUrl: logo } }
          : {}),
      });
      await qc.invalidateQueries({ queryKey: ["organization", organizationId] });
      await qc.invalidateQueries({ queryKey: ["organizations"] });
      await experience.refresh();
      await qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("members") });
      toast.success("Your changes are saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormModal
      open={open}
      onOpenChange={(v) => {
        if (!busy && !uploading) onOpenChange(v);
      }}
      dirty={!!baseline && snapshot !== baseline}
      submitLabel="Save changes"
      title="Make it yours"
      description="A familiar workspace, with your own personality."
      contentClassName="sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
      submitting={busy || uploading || !experience.ready || !baseline}
      onSubmit={save}
    >
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {[
          ["profile", "Your profile", UserRound],
          ...(organizationId ? [["home", "Your home", LayoutDashboard]] : []),
          ...(experience.appearance.canEdit ? [["organization", "Organization", Building2]] : []),
        ].map(([id, label, Icon]) => {
          const TabIcon = Icon as typeof UserRound;
          return (
            <Button
              key={String(id)}
              type="button"
              variant={tab === id ? "secondary" : "ghost"}
              onClick={() => setTab(String(id))}
            >
              <TabIcon className="mr-2 h-4 w-4" />
              {String(label)}
            </Button>
          );
        })}
      </div>
      {experience.error ? (
        <p role="alert" className="text-sm text-destructive">
          Settings could not be loaded. Close this panel and try again.
        </p>
      ) : null}
      {
        <div hidden={tab !== "profile"}>
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-[var(--brand-soft)] p-4">
              <Avatar name={name} src={photo} size="xl" />
              <div>
                <p className="font-semibold">{name || "Your profile"}</p>
                <p className="text-sm text-muted-foreground">How your teammates see you</p>
              </div>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Display name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <ImagePicker
              value={photo}
              onChange={setPhoto}
              target={{ scope: "user", targetId: profile?.id ?? "" }}
              onBusyChange={setUploading}
            />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Or choose a simple avatar
              </p>
              <div className="flex gap-2">
                {["iris", "fern", "sun", "rose"].map((avatar) => (
                  <Button
                    variant="ghost"
                    key={avatar}
                    type="button"
                    aria-label={`Choose ${avatar} avatar`}
                    aria-pressed={photo === `avatar:${avatar}`}
                    className={`h-auto rounded-2xl p-1 ${photo === `avatar:${avatar}` ? "ring-2 ring-[var(--brand)]" : ""}`}
                    onClick={() => setPhoto(`avatar:${avatar}`)}
                  >
                    <Avatar name={name} src={`avatar:${avatar}`} size="lg" />
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Theme
                <Select
                  value={personal.theme}
                  onValueChange={(value) =>
                    setPersonal({ ...personal, theme: value as typeof personal.theme })
                  }
                >
                  <SelectTrigger aria-label="Theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Follow system</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm">
                Movement
                <Select
                  value={personal.motion}
                  onValueChange={(value) =>
                    setPersonal({ ...personal, motion: value as typeof personal.motion })
                  }
                >
                  <SelectTrigger aria-label="Movement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Follow system</SelectItem>
                    <SelectItem value="reduced">Reduce decorative motion</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
        </div>
      }
      {organizationId && (
        <div hidden={tab !== "home"}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose what matters to you. Drag blocks or use the arrows. Only your home changes.
            </p>
            {preferences.favorites.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Your shortcuts</p>
                {preferences.favorites.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span>{item.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPreferences({
                          ...preferences,
                          favorites: preferences.favorites.filter((f) => f.id !== item.id),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <BlockEditor
              value={preferences.blocks ?? experience.appearance.blocks}
              onChange={(blocks) => setPreferences({ ...preferences, blocks })}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPreferences({ ...preferences, blocks: null })}
            >
              Use organization defaults
            </Button>
          </div>
        </div>
      )}
      {organizationId && appearance.canEdit && (
        <div hidden={tab !== "organization"}>
          <div className="space-y-5">
            <div
              className="rounded-2xl border p-5"
              style={{
                background: `color-mix(in srgb, ${/^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : DEFAULT_APPEARANCE.color} 12%, var(--card))`,
              }}
            >
              <div className="flex items-center gap-3">
                <Avatar name={org.data?.name ?? ""} src={logo} size="lg" />
                <div>
                  <p className="font-semibold">{org.data?.name}</p>
                  <p className="text-sm text-muted-foreground">Your shared workspace identity</p>
                </div>
                <Palette className="ml-auto h-5 w-5" style={{ color: appearance.color }} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Logo</p>
              <ImagePicker
                variant="logo"
                value={logo}
                onChange={setLogo}
                target={{ scope: "organization", targetId: organizationId! }}
                onBusyChange={setUploading}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Cover</p>
              <ImagePicker
                value={appearance.cover}
                onChange={(cover) => setAppearance({ ...appearance, cover })}
                target={{ scope: "organization", targetId: organizationId! }}
                variant="cover"
                onBusyChange={setUploading}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Accent color</p>
              <ColorPicker
                value={appearance.color}
                onChange={(color) => setAppearance({ ...appearance, color })}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Default home</p>
              <BlockEditor
                value={appearance.blocks}
                onChange={(blocks) => setAppearance({ ...appearance, blocks })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAppearance({ ...DEFAULT_APPEARANCE, canEdit: true })}
            >
              Restore appearance defaults
            </Button>
          </div>
        </div>
      )}
    </FormModal>
  );
}
