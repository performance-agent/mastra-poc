import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/app/SetupWizard";

export const Route = createFileRoute("/organizations/$organizationId/setup/$step")({
  head: () => ({ meta: [{ title: "Set up your team · Platformance" }] }),
  component: Page,
});
function Page() {
  const { organizationId, step } = Route.useParams();
  return <SetupPage key={organizationId} organizationId={organizationId} routeStep={step} />;
}
