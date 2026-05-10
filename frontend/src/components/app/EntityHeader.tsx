import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

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
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4 min-w-0">
        <Avatar name={name} src={photoUrl} size="xl" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          )}
          {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
      </div>
      {(onEdit || onDelete) && (
        <div className="flex shrink-0 gap-2">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
