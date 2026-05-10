import { Button } from "@/components/ui/button";
import { Pencil, ExternalLink, GitBranch } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Resource } from "@/lib/types";

export function ResourceCard({
  resource,
  onEdit,
  action,
}: {
  resource: Resource;
  onEdit?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{resource.name}</h3>
            {resource.private !== undefined && (
              <StatusBadge variant={resource.private ? "warning" : "neutral"}>
                {resource.private ? "Private" : "Public"}
              </StatusBadge>
            )}
          </div>
          {resource.fullName && (
            <p className="truncate text-xs text-muted-foreground">{resource.fullName}</p>
          )}
          {resource.description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
              {resource.description}
            </p>
          )}
        </div>
        {onEdit && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {resource.type && <StatusBadge>{resource.type}</StatusBadge>}
          {resource.defaultBranch && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {resource.defaultBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {resource.htmlUrl && (
            <a
              href={resource.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}
