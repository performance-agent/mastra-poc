import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { SearchInput } from "@/components/app/SearchInput";
import { EntityCard } from "@/components/app/EntityCard";
import { EmptyState } from "@/components/app/EmptyState";
import { LoadingState } from "@/components/app/LoadingState";
import { ErrorState } from "@/components/app/ErrorState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EntityFormDialog } from "@/components/app/EntityFormDialog";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { Organization } from "@/lib/types";

export const Route = createFileRoute("/organizations/")({
  head: () => ({
    meta: [
      { title: "Organizations — Performance Agent" },
      {
        name: "description",
        content: "Choose an organization to enter your workspace.",
      },
    ],
  }),
  component: OrganizationsIndex,
});

function fmtDate(s?: string) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function OrganizationsIndex() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (o) => o.name.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["organizations"] });

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations" }]} />
        <div className="experience-directory flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="experience-eyebrow mb-2">Your teams. Their own identity.</p>
            <h1 className="text-3xl font-semibold tracking-tight">Find your space</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every team has a place to turn its work into understanding.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search organizations…"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create organization
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-4 w-4" />}
            title="Create your first organization"
            description="Organizations group workspaces, members, resources, and plugins."
            actionLabel="New organization"
            onAction={() => setCreateOpen(true)}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" description="Try a different search term." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((o) => (
              <EntityCard
                key={o.id}
                name={o.name}
                description={o.description}
                photoUrl={o.photoUrl}
                to="/organizations/$organizationId"
                params={{ organizationId: o.id }}
                meta={fmtDate(o.updatedAt || o.createdAt) || ""}
                onEdit={() => setEditing(o)}
                onDelete={() => setDeleting(o)}
              />
            ))}
          </div>
        )}
      </div>

      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New organization"
        submitLabel="Create"
        onSubmit={async (v) => {
          try {
            const created = await api.createOrganization(v);
            toast.success("Organization created");
            await refresh();
            await navigate({
              to: "/organizations/$organizationId",
              params: { organizationId: created.id },
            });
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <EntityFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Edit organization"
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                description: editing.description ?? undefined,
                photoUrl: editing.photoUrl ?? undefined,
              }
            : undefined
        }
        onSubmit={async (v) => {
          if (!editing) return;
          try {
            await api.updateOrganization(editing.id, v);
            toast.success("Organization updated");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This will remove the organization and its workspaces. This cannot be undone."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteOrganization(deleting.id);
            toast.success("Organization deleted");
            setDeleting(null);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </AppShell>
  );
}
