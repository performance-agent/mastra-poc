import { useState } from "react";
import { LayoutGrid, List, MoreHorizontal, Trash2, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";
import { RoleSelect } from "./RoleSelect";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Membership, Role } from "@/lib/types";
import { roleSelectOptions, ROLES_BY_HIERARCHY } from "@/lib/membership-role";

export function MemberList({
  members,
  currentUserId,
  actorRole,
  onRoleChange,
  onRemove,
  onInvite,
}: {
  members: Membership[];
  currentUserId?: string;
  actorRole?: Role;
  onRoleChange?: (userId: string, role: Role) => void;
  onRemove?: (userId: string) => void;
  onInvite?: () => void;
}) {
  const [compact, setCompact] = useState(false);
  if (!members.length)
    return (
      <EmptyState
        icon={<Users className="h-4 w-4" />}
        title="No members yet"
        description="Invite someone by email to give them access at this level."
        actionLabel={onInvite ? "Add member" : undefined}
        onAction={onInvite}
      />
    );
  const ownerCount = members.filter((member) => member.role === "OWNER").length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} people, one team</p>
        <Button
          variant="outline"
          size="sm"
          aria-label={compact ? "Show member cards" : "Show compact members"}
          onClick={() => setCompact(!compact)}
        >
          {compact ? <LayoutGrid className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
          {compact ? "Cards" : "Compact"}
        </Button>
      </div>
      <ul
        className={
          compact
            ? "divide-y divide-border overflow-hidden rounded-2xl border bg-card"
            : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        }
      >
        {members.map((member) => {
          const u = member.user,
            display = u.name || u.email || member.userId;
          const options = !onRoleChange
            ? null
            : currentUserId && actorRole
              ? roleSelectOptions({
                  actorRole,
                  actorUserId: currentUserId,
                  targetUserId: member.userId,
                  targetRole: member.role,
                  ownerCount,
                })
              : ROLES_BY_HIERARCHY;
          return (
            <li
              key={member.userId}
              className={
                compact
                  ? "flex flex-wrap items-center gap-4 p-4"
                  : "flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card"
              }
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={display} src={u.photoUrl} size={compact ? "md" : "lg"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {display}
                    {member.userId === currentUserId && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div
                className={
                  compact
                    ? "flex items-center gap-3"
                    : "flex items-center justify-between gap-3 border-t border-border/60 pt-3"
                }
              >
                {options ? (
                  <RoleSelect
                    value={member.role}
                    allowedRoles={options}
                    onChange={(role) => onRoleChange?.(member.userId, role)}
                  />
                ) : (
                  <RoleBadge role={member.role} />
                )}
                {onRemove && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label={`Actions for ${display}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onRemove(member.userId)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
