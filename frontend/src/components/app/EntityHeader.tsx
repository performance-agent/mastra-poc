import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "@tanstack/react-router";
import { useExperience } from "@/lib/experience-context";
import { useImageSource } from "@/lib/media";
import { EntityShortcut } from "./EntityShortcut";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";

export function EntityHeader({
  name,
  description,
  photoUrl,
  onEdit,
  onDelete,
  meta,
}: {
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  meta?: React.ReactNode;
}) {
  const experience = useExperience();
  const { pathname } = useLocation();
  const cover = useImageSource(
    /^\/organizations\/[^/]+\/?$/.test(pathname) ? experience.appearance.cover : undefined,
  );
  return (
    <div className="experience-entity-header relative isolate flex flex-row items-start justify-between gap-4 overflow-hidden">
      {cover && (
        <>
          <img src={cover} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-card/95 to-card/60" />
        </>
      )}
      <div className="flex min-w-0 items-start gap-4">
        <Avatar name={name} src={photoUrl} size="xl" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <EntityShortcut name={name} />
          </div>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          )}
          {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
      </div>
      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit details
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
