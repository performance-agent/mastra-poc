import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { FormModal } from "./FormModal";
import { Input } from "@/components/ui/input";
export function TeamSpaceFields({
  workspaceName,
  groupName,
  description,
  onWorkspace,
  onGroup,
  onDescription,
}: {
  workspaceName: string;
  groupName: string;
  description: string;
  onWorkspace: (v: string) => void;
  onGroup: (v: string) => void;
  onDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-[var(--brand-soft)] p-5">
      <label className="grid gap-2 text-sm font-medium">
        Workspace name
        <Input
          required
          aria-label="New workspace name"
          value={workspaceName}
          onChange={(e) => onWorkspace(e.target.value)}
          placeholder="Product team"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        First project name
        <Input
          required
          aria-label="First project name"
          value={groupName}
          onChange={(e) => onGroup(e.target.value)}
          placeholder="Engineering"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        A workspace brings your team together. Projects organize the work you evaluate.
      </p>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="group -ml-3">
            More options
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <label className="mt-3 grid gap-2 text-sm">
            Description
            <Input value={description} onChange={(e) => onDescription(e.target.value)} />
          </label>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
export function TeamSpaceDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (open) {
      setWorkspaceName("");
      setGroupName("");
      setDescription("");
    }
  }, [open]);
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create your team space"
      description="One workspace and its first project, ready together."
      submitLabel="Create"
      dirty={!!(workspaceName || groupName || description)}
      submitting={busy}
      onSubmit={async () => {
        setBusy(true);
        try {
          await api.createTeamSpace(organizationId, { workspaceName, groupName, description });
          await qc.invalidateQueries({ queryKey: ["organization", organizationId, "workspaces"] });
          onOpenChange(false);
          toast.success("Your team space is ready");
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <TeamSpaceFields
        {...{ workspaceName, groupName, description }}
        onWorkspace={setWorkspaceName}
        onGroup={setGroupName}
        onDescription={setDescription}
      />
    </FormModal>
  );
}
