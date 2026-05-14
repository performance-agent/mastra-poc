import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, UserPlus } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { Avatar } from "@/components/app/Avatar";
import { SearchInput } from "@/components/app/SearchInput";
import { LoadingState } from "@/components/app/LoadingState";
import { ErrorState } from "@/components/app/ErrorState";
import { EmptyState } from "@/components/app/EmptyState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { FormModal } from "@/components/app/FormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users — Performance Agent" },
      { name: "description", content: "Manage users available for membership assignment." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const q = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? list.filter((u) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s))
      : list;
  }, [q.data, search]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Users" }]} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Users you can add as members across organizations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Search users…" />
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-4 w-4" />}
            title="No users yet"
            description="Users are created automatically when they register."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {filtered.map((u) => (
                <li key={u.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <Avatar name={u.name || u.email} src={u.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.name || u.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditing(u)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(u)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <UserFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing ?? undefined}
        onSubmit={async (v) => {
          if (!editing) return;
          await api.updateUser(editing.id, v);
          toast.success("User updated");
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name || deleting?.email}?`}
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteUser(deleting.id);
            toast.success("User deleted");
            setDeleting(null);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </AppShell>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: User;
  onSubmit: (values: Partial<User>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setEmail(initial?.email ?? "");
      setPhotoUrl(initial?.photoUrl ?? "");
    }
  }, [open, initial]);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit user"
      submitLabel="Save"
      submitting={submitting}
      onSubmit={async () => {
        if (!name.trim() || !email.trim()) {
          toast.error("Fill all required fields");
          return;
        }
        setSubmitting(true);
        try {
          await onSubmit({
            name: name.trim(),
            email: email.trim(),
            photoUrl: photoUrl.trim() || undefined,
          });
          onOpenChange(false);
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="u-name">Name</Label>
        <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-email">Email</Label>
        <Input
          id="u-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-photo">Photo URL</Label>
        <Input
          id="u-photo"
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
        />
      </div>
    </FormModal>
  );
}
