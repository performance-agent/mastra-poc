import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useExperience } from "@/lib/experience-context";
import { errorMessage } from "@/lib/api";
import type { Shortcut } from "@/lib/experience";

export function EntityShortcut({ name }: { name: string }) {
  const { pathname } = useLocation();
  const experience = useExperience();
  const visited = useRef("");
  const match = pathname.match(
    /^\/organizations\/([^/]+)\/workspaces\/([^/]+)(?:\/groups\/([^/]+))?\/?$/,
  );
  const org = match?.[1],
    workspaceId = match?.[2],
    groupId = match?.[3];
  const id = groupId ?? workspaceId;
  const { preferences } = experience;
  useEffect(() => {
    if (
      !id ||
      !workspaceId ||
      !experience.ready ||
      org !== experience.organizationId ||
      visited.current === id
    )
      return;
    visited.current = id;
    const shortcut: Shortcut = { kind: groupId ? "group" : "workspace", id, workspaceId, name };
    if (preferences.recent[0]?.id === id && preferences.recent[0]?.name === name) return;
    void experience
      .savePreferences({
        ...preferences,
        recent: [shortcut, ...preferences.recent.filter((item) => item.id !== id)].slice(0, 12),
      })
      .catch(() => {
        visited.current = "";
      });
  }, [id, workspaceId, groupId, name, org, experience, preferences]);
  if (!id || !workspaceId) return null;
  const starred = preferences.favorites.some((item) => item.id === id);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={starred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={starred}
      disabled={!experience.ready}
      onClick={() => {
        const item: Shortcut = { kind: groupId ? "group" : "workspace", id, workspaceId, name };
        void experience
          .savePreferences({
            ...preferences,
            favorites: starred
              ? preferences.favorites.filter((f) => f.id !== id)
              : [...preferences.favorites, item].slice(-30),
          })
          .catch((error) => toast.error(errorMessage(error)));
      }}
    >
      <Star
        className={`h-4 w-4 ${starred ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
      />
    </Button>
  );
}
