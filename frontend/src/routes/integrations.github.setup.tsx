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
      { name: "description", content: "Completing GitHub integration setup." },
    ],
  }),
  component: GithubSetupPage,
});

type Status = "connecting" | "success" | "error";

function getGithubSetupParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    installationId: params.get("installation_id") || params.get("installationId") || "",
    setupAction: params.get("setup_action") || params.get("setupAction") || "",
    state: params.get("state") || "",
  };
}

function GithubSetupPage() {
  const [status, setStatus] = useState<Status>("connecting");
  const [message, setMessage] = useState("Connecting GitHub to your organization...");

  useEffect(() => {
    let cancelled = false;

    async function completeSetup() {
      const pending = readPendingGithubSetup();
      const { installationId, setupAction, state } = getGithubSetupParams();

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

      try {
        await api.setupGithub(pending.organizationId, {
          installationId,
          setupAction: setupAction || "install",
          ...(state ? { state } : {}),
        });
        clearPendingGithubSetup();
        if (cancelled) return;
        setStatus("success");
        setMessage("GitHub connected. Redirecting to integrations...");
        window.location.assign(`/organizations/${pending.organizationId}?tab=integrations`);
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
              <Link to="/organizations">Back to organizations</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
