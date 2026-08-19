import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES_BY_HIERARCHY, roleLabel } from "@/lib/membership-role";
import type { Role } from "@/lib/types";

export function RoleSelect({
  value,
  onChange,
  allowedRoles,
}: {
  value: Role;
  onChange: (role: Role) => void;
  allowedRoles?: Role[];
}) {
  const roles = allowedRoles ?? ROLES_BY_HIERARCHY;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabel(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
