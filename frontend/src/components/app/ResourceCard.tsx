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
  const fullName = resource.fullName ?? resource.githubRepository?.fullName;
  const defaultBranch = resource.defaultBranch ?? resource.githubRepository?.defaultBranch;
  const htmlUrl = resource.htmlUrl ?? resource.githubRepository?.htmlUrl;
  const isPrivate = resource.private ?? resource.githubRepository?.isPrivate ?? undefined;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">
              {resource.name}
            </h3>
            {isPrivate !== undefined && (
              <StatusBadge variant={isPrivate ? "warning" : "neutral"}>
                {isPrivate ? "Private" : "Public"}
              </StatusBadge>
            )}
          </div>
          {fullName && (
            <p className="mt-1 break-all text-xs text-muted-foreground">{fullName}</p>
          )}
          {resource.description && (
            <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
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
      <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {resource.type && <StatusBadge>{resource.type}</StatusBadge>}
          {defaultBranch && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {defaultBranch}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {htmlUrl && (
            <a
              href={htmlUrl}
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
