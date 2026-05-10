import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

const map: Record<Role, string> = {
  OWNER: "bg-primary text-primary-foreground",
  ADMIN: "bg-accent text-accent-foreground border border-border",
  VIEWER: "bg-muted text-muted-foreground border border-border",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        map[role],
      )}
    >
      {role}
    </span>
  );
}
