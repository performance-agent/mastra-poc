import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { clearPendingGithubSetup, readPendingGithubSetup } from "@/lib/github-setup";

export const Route = createFileRoute("/integrations/github/setup")({
  head: () => ({
    meta: [
      { title: "Connecting GitHub - Performance Agent" },
      { name: "description", content: "Completing GitHub plugin setup." },
    ],
  }),
  component: GithubSetupPage,
});

type Status = "connecting" | "success" | "error";
type SetupAction = "install" | "update";

function getGithubSetupParams() {
  const params = new URLSearchParams(window.location.search);
  const rawSetupAction = params.get("setup_action") || params.get("setupAction") || "install";
  const setupAction: SetupAction | null =
    rawSetupAction === "install" || rawSetupAction === "update" ? rawSetupAction : null;
  return {
    installationId: params.get("installation_id") || params.get("installationId") || "",
    setupAction,
    rawSetupAction,
  };
}

function GithubSetupPage() {
  const [status, setStatus] = useState<Status>("connecting");
  const [message, setMessage] = useState("Connecting GitHub to your organization...");

  useEffect(() => {
    let cancelled = false;

    async function completeSetup() {
      const pending = readPendingGithubSetup();
      const { installationId, setupAction, rawSetupAction } = getGithubSetupParams();

      if (!pending?.organizationId) {
        setStatus("error");
        setMessage("No organization was selected before starting GitHub setup.");
        return;
      }

      if (!installationId) {
        setStatus("error");
        setMessage("GitHub did not return an installation id.");
        return;
      }

      if (!setupAction) {
        setStatus("error");
        setMessage(`GitHub returned an unsupported setup action: ${rawSetupAction}.`);
        return;
      }

      setMessage(
        setupAction === "update"
          ? "Updating GitHub connection..."
          : "Connecting GitHub to your organization...",
      );

      try {
        await api.setupGithub(pending.organizationId, {
          installationId,
          setupAction,
        });
        clearPendingGithubSetup();
        if (cancelled) return;
        setStatus("success");
        setMessage(
          setupAction === "update"
            ? "GitHub connection updated. Redirecting to plugins..."
            : "GitHub connected. Redirecting to plugins...",
        );
        window.location.assign(
          pending.returnTo ??
            `/organizations/${encodeURIComponent(pending.organizationId)}?tab=plugins`,
        );
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(errorMessage(error));
      }
    }

    completeSetup();

    return () => {
      cancelled = true;
    };
  }, []);

  const icon =
    status === "connecting" ? (
      <Loader2 className="h-5 w-5 animate-spin" />
    ) : status === "success" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : (
      <TriangleAlert className="h-5 w-5" />
    );

  const returnTo = readPendingGithubSetup()?.returnTo;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-lg shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {status === "connecting" ? <PlugZap className="h-4 w-4" /> : icon}
            </div>
            <div>
              <CardTitle>GitHub setup</CardTitle>
              <CardDescription>Performance Agent</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {status === "error" ? (
            <Button asChild variant="outline" className="w-full">
              <Link to={(returnTo ?? "/organizations") as never}>
                {returnTo ? "Return to setup" : "Back to organizations"}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
