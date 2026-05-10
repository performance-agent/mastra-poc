import { Link } from "@tanstack/react-router";
import { Avatar } from "./Avatar";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface EntityCardProps {
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  to: string;
  params?: Record<string, string>;
  meta?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function EntityCard({
  name,
  description,
  photoUrl,
  to,
  params,
  meta,
  onEdit,
  onDelete,
}: EntityCardProps) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:border-border-strong hover:shadow-card-hover">
      <Link
        to={to}
        params={params}
        className="flex items-start gap-3"
        aria-label={`Open ${name}`}
      >
        <Avatar name={name} src={photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{name}</div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground/70">No description</p>
          )}
        </div>
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{meta}</div>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
