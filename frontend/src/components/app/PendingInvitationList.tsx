import { useState } from "react";
import { Copy, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/app/RoleBadge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import type { Invitation } from "@/lib/types";

export function PendingInvitationList({
  invitations,
  onRevoke,
}: {
  invitations: Invitation[];
  onRevoke?: (invitationId: string) => void | Promise<void>;
}) {
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const pending = invitations.find((invitation) => invitation.id === revokeId);
  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Pending invitations</h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{invitation.email}</div>
                <div className="truncate text-xs text-muted-foreground">Waiting to accept</div>
              </div>
              <RoleBadge role={invitation.role} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Copy invite link"
                onClick={async () => {
                  await navigator.clipboard.writeText(invitation.inviteUrl);
                  toast.success("Invite link copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {onRevoke && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Revoke invitation"
                  onClick={() => setRevokeId(invitation.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={!!pending && !!onRevoke}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null);
        }}
        title="Revoke invitation?"
        description={
          pending
            ? `This will cancel the invitation for ${pending.email}. The invite link will no longer work.`
            : undefined
        }
        confirmLabel="Revoke invitation"
        destructive
        onConfirm={() => {
          if (pending) return onRevoke?.(pending.id);
        }}
      />
    </div>
  );
}
