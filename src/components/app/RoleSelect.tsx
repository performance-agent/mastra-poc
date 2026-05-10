import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/lib/types";

export function RoleSelect({
  value,
  onChange,
}: {
  value: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="OWNER">Owner</SelectItem>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="VIEWER">Viewer</SelectItem>
      </SelectContent>
    </Select>
  );
}
