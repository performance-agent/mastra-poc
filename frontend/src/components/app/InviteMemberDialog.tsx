import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelect } from "@/components/app/RoleSelect";
import { errorMessage } from "@/lib/api";
import type { Invitation, Role } from "@/lib/types";

export function InviteMemberDialog({
  open,
  onOpenChange,
  role,
  setRole,
  allowedRoles,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  setRole: (role: Role) => void;
  allowedRoles?: Role[];
  onInvite: (email: string, role: Role) => Promise<Invitation>;
}) {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setInviteUrl(undefined);
    setSubmitting(false);
    setRole("VIEWER");
  }, [open, setRole]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inviteUrl ? "Invitation created" : "Invite member"}</DialogTitle>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Share this link with {email || "the invited user"}. They can sign in or create an
              account to join.
            </p>
            <Input readOnly value={inviteUrl} />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <RoleSelect value={role} allowedRoles={allowedRoles} onChange={setRole} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {inviteUrl ? "Done" : "Cancel"}
          </Button>
          {inviteUrl ? (
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                toast.success("Invite link copied");
              }}
            >
              Copy link
            </Button>
          ) : (
            <Button
              disabled={!email.trim() || submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  const invitation = await onInvite(email.trim(), role);
                  setInviteUrl(invitation.inviteUrl);
                  toast.success("Invitation created");
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Send invite
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
