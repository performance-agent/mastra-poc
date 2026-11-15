import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import { useExperience } from "@/lib/experience-context";
import { LoadingState } from "@/components/app/LoadingState";
import { ErrorState } from "@/components/app/ErrorState";
export const Route = createFileRoute("/")({
  validateSearch: z.object({ org: z.string().optional() }),
  component: Entry,
});
function Entry() {
  const navigate = useNavigate();
  const { org } = Route.useSearch();
  const { profile } = useExperience();
  const organizations = useQuery({ queryKey: ["organizations"], queryFn: api.listOrganizations });
  useEffect(() => {
    if (!organizations.data || !profile) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem("platformance:last-org:" + profile.id);
    } catch {
      /* Storage is optional. */
    }
    const candidate = org ?? last;
    const selected =
      organizations.data.find((o) => o.id === candidate) ??
      (organizations.data.length === 1 ? organizations.data[0] : undefined);
    void navigate(
      selected
        ? {
            to: "/organizations/$organizationId",
            params: { organizationId: selected.id },
            replace: true,
          }
        : { to: "/organizations", replace: true },
    );
  }, [organizations.data, profile, org, navigate]);
  return organizations.error ? (
    <ErrorState
      message="Could not load organizations"
      onRetry={() => void organizations.refetch()}
    />
  ) : (
    <LoadingState />
  );
}
