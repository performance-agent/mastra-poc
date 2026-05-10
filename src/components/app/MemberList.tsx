import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";
import { RoleSelect } from "./RoleSelect";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Membership, Role, User } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { Users } from "lucide-react";

export function MemberList({
  members,
  users,
  onRoleChange,
  onRemove,
  onInvite,
}: {
  members: Membership[];
  users: User[];
  onRoleChange?: (userId: string, role: Role) => void;
  onRemove?: (userId: string) => void;
  onInvite?: () => void;
}) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-4 w-4" />}
        title="No members yet"
        description="Add a user to give them access at this level."
        actionLabel={onInvite ? "Add member" : undefined}
        onAction={onInvite}
      />
    );
  }
  const userMap = new Map(users.map((u) => [u.id, u]));
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const u = userMap.get(m.userId);
          const display = u?.name || u?.email || m.userId;
          return (
            <li key={m.userId} className="flex items-center gap-3 p-3 sm:p-4">
              <Avatar name={display} src={u?.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{display}</div>
                {u?.email && (
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                )}
              </div>
              {onRoleChange ? (
                <RoleSelect value={m.role} onChange={(r) => onRoleChange(m.userId, r)} />
              ) : (
                <RoleBadge role={m.role} />
              )}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(m.userId)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
