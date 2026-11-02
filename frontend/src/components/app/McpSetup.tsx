import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import {
  MCP_AGENT_INSTRUCTIONS,
  MCP_CLIENTS,
  mcpConfiguration,
  type McpClient,
} from "@/lib/mcp-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

export function McpSetup({
  client: controlledClient,
  onClientChange,
}: {
  client?: McpClient;
  onClientChange?: (client: McpClient) => void;
}) {
  const [localClient, setLocalClient] = useState<McpClient>("claude");
  const client = controlledClient ?? localClient;
  const current = MCP_CLIENTS.find((item) => item.id === client) ?? MCP_CLIENTS[1];
  const connection = useQuery({
    queryKey: ["mcp", "connection"],
    queryFn: api.getMcpConnection,
    refetchInterval: 10000,
  });
  const serverUrl = connection.data?.serverUrl ?? "";
  const configuration = serverUrl ? mcpConfiguration(client, serverUrl) : null;
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }
  return (
    <section className="space-y-5" aria-label="MCP connection setup">
      <div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-[var(--brand-soft)] p-3 text-[var(--brand-ink)]">
            <Plug className="size-6" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Connect your assistant</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your evaluators from the tools you already work with.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="MCP clients">
        {MCP_CLIENTS.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            aria-pressed={client === item.id}
            className={
              client === item.id
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]"
                : ""
            }
            onClick={() => {
              setLocalClient(item.id);
              onClientChange?.(item.id);
            }}
          >
            {item.name}
          </Button>
        ))}
      </div>
      {connection.isLoading ? (
        <LoadingState />
      ) : connection.error ? (
        <ErrorState message={errorMessage(connection.error)} onRetry={() => connection.refetch()} />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
            <h3 className="font-semibold">{current.name} setup</h3>
            <div className="space-y-2">
              <label htmlFor="mcp-server-url" className="text-sm font-medium">
                Server URL
              </label>
              <div className="flex gap-2">
                <Input id="mcp-server-url" readOnly value={serverUrl} className="min-w-0" />
                <Button
                  variant="outline"
                  aria-label="Copy server URL"
                  onClick={() => copy(serverUrl, "Server URL")}
                >
                  <Copy className="size-4" />
                  <span className="ml-2 hidden sm:inline">Copy</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                OAuth · Sign in with your platform account when prompted.
              </p>
            </div>
            <ol className="space-y-4 border-t pt-5">
              {current.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-ink)]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            {configuration && (
              <div className="min-w-0 rounded-xl border bg-muted/30">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="text-xs font-medium">
                    {client === "local"
                      ? "Claude Code command"
                      : client === "vscode"
                        ? ".vscode/mcp.json"
                        : ".cursor/mcp.json"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(configuration, "Configuration")}
                  >
                    <Copy className="mr-2 size-3.5" />
                    Copy config
                  </Button>
                </div>
                <pre className="overflow-x-auto p-4 text-xs leading-relaxed" tabIndex={0}>
                  {configuration}
                </pre>
              </div>
            )}
            <div className="space-y-3 border-t pt-5">
              <h3 className="font-semibold">Give your agent the workflow</h3>
              <p className="text-sm text-muted-foreground">
                Choose a group and evaluator, analyze the saved evidence, then save the report.
              </p>
              <details className="rounded-xl border bg-[var(--brand-soft)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Preview agent instructions
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">
                  {MCP_AGENT_INSTRUCTIONS}
                </pre>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => copy(MCP_AGENT_INSTRUCTIONS, "Agent instructions")}
                >
                  <Copy className="mr-2 size-4" />
                  Copy agent instructions
                </Button>
                <Button variant="ghost" asChild>
                  <a href={current.docs} target="_blank" rel="noreferrer">
                    Official setup guide
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
          <aside
            className="space-y-4 rounded-2xl border bg-card p-5"
            aria-label="MCP authorization status"
          >
            <h3 className="font-semibold">Your authorized clients</h3>
            {connection.data?.clients.length ? (
              <>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {connection.data.clients.length} authorized
                </p>
                <ul className="space-y-2 text-sm">
                  {connection.data.clients.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  These clients have an active authorization for your account. This does not
                  indicate that they are currently online.
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  Not authorized yet
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Copying instructions does not connect your client. Complete sign-in from your
                  assistant.
                </p>
              </>
            )}
            <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              Viewers can read. Owners and admins can save reports. Access follows your group
              memberships across the platform.
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={connection.isFetching}
              onClick={() => connection.refetch()}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${connection.isFetching ? "animate-spin" : ""}`}
              />
              Refresh status
            </Button>
          </aside>
        </div>
      )}
    </section>
  );
}
