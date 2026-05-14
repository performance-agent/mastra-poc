import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User } from "@/lib/types";

export function UserPicker({
  users,
  value,
  onChange,
  excludeIds = [],
  placeholder = "Select a user…",
}: {
  users: User[];
  value?: string;
  onChange: (userId: string) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const filtered = users.filter((u) => !excludeIds.includes(u.id));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">No users available</div>
        )}
        {filtered.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span className="flex flex-col">
              <span className="text-sm">{u.name || u.email}</span>
              {u.name && <span className="text-[11px] text-muted-foreground">{u.email}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
