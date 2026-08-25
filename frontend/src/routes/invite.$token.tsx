import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { roleLabel } from "@/lib/membership-role";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Invitation — Performance Agent" },
      { name: "description", content: "Accept an invitation to join a workspace." },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const { firebaseUser } = useAuth();
  const invitationQ = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.getInvitation(token),
    enabled: Boolean(firebaseUser),
  });
  const accept = useMutation({
    mutationFn: () => api.acceptInvitation(token),
    onSuccess: (invitation) => {
      toast.success(`You joined ${invitation.scope?.name ?? "the space"}`);
      const scope = invitation.scope;
      if (scope?.type === "organization") {
        window.location.replace(`/organizations/${scope.id}?tab=members`);
        return;
      }
      window.location.replace("/organizations");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const invitation = invitationQ.data;
  const signedInEmail = firebaseUser?.email?.toLowerCase();
  const invitedEmail = invitation?.email.toLowerCase();
  const emailMismatch = Boolean(signedInEmail && invitedEmail && signedInEmail !== invitedEmail);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-lg shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Invitation</CardTitle>
          </div>
          <CardDescription>
            {invitation
              ? `Join ${invitation.scope?.name ?? "this space"} as ${roleLabel(invitation.role)}.`
              : "Accept this invitation to get access."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitationQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitationQ.error ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage(invitationQ.error)}
            </p>
          ) : (
            <>
              {invitation && (
                <p className="text-sm text-muted-foreground">
                  This invitation was sent to{" "}
                  <span className="font-medium text-foreground">{invitation.email}</span>.
                </p>
              )}
              {emailMismatch && (
                <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  You are signed in as {firebaseUser?.email}. Sign in with {invitation?.email} to
                  accept.
                </p>
              )}
              <Button
                className="w-full"
                disabled={accept.isPending || emailMismatch}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accept invitation
              </Button>
            </>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to="/organizations">Back to organizations</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
