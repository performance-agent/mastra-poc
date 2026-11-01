import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Plug, Check, Loader2, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { savePendingGithubSetup } from "@/lib/github-setup";
import { setupUrl, type Setup } from "@/lib/experience";
import type { Resource } from "@/lib/types";
import { PluginConfigurationFields } from "./PluginConfigurationFields";

export function SetupPlugins({
  org,
  draft,
  resources,
  onChange,
  canConnect,
  canAssign,
  beforeAuthorize,
  onCredentialsChange,
  onBusyChange,
}: {
  org: string;
  draft: Setup;
  resources: Resource[];
  onChange: (patch: Partial<Setup>) => void;
  canConnect: boolean;
  canAssign: boolean;
  beforeAuthorize: () => Promise<void>;
  onCredentialsChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
  const installations = useQuery({
    queryKey: ["organization", org, "plugin-installations"],
    queryFn: () => api.listOrgPluginInstallations(org),
    refetchInterval: 3000,
  });
  const [pluginId, setPluginId] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({ name: "Jira" });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const plugin = catalog.data?.find(
    (item) => item.id === (pluginId || installations.data?.[0]?.pluginId || catalog.data?.[0]?.id),
  );
  const connections = installations.data?.filter((item) => item.pluginId === plugin?.id) ?? [];
  const installation = connections.find((item) => item.id === installationId) ?? connections[0];
  const credentialDirty =
    (!installation || connecting) &&
    plugin?.id === "jira" &&
    Object.entries(values).some(([key, value]) => key !== "name" && !!value);
  useEffect(() => {
    onCredentialsChange(credentialDirty);
    return () => onCredentialsChange(false);
  }, [credentialDirty, onCredentialsChange]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (installations.data)
      void qc.invalidateQueries({ queryKey: ["organization", org, "resources"] });
  }, [installations.data, qc, org]);
  const update = async () => {
    await Promise.all([
      installations.refetch(),
      qc.invalidateQueries({ queryKey: ["organization", org, "resources"] }),
    ]);
  };
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!plugin) return;
    setBusy(true);
    setError("");
    try {
      if (plugin.id === "jira") {
        const result = await api.setupJira(org, values);
        setValues({ name: "Jira" });
        setConnecting(false);
        setInstallationId(result.id);
        await update();
      } else if (plugin.setupUrl) {
        await beforeAuthorize();
        savePendingGithubSetup(org, setupUrl(org, "plugins"));
        window.location.assign(plugin.setupUrl);
      } else throw new Error("This plugin is not available to connect yet.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const list = resources.filter(
    (resource) =>
      resource.active !== false &&
      (!installation ||
        resource.installationId === installation.id ||
        resource.pluginInstallation?.id === installation.id),
  );
  const unavailable = draft.resourceIds.filter(
    (id) =>
      !resources.some(
        (resource) =>
          resource.id === id &&
          resource.active !== false &&
          (!resource.pluginInstallation || resource.pluginInstallation.status === "ACTIVE"),
      ),
  );
  const visible = list.filter((resource) =>
    `${resource.name} ${resource.fullName ?? resource.externalId ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-7">
      {!!unavailable.length && (
        <div role="alert" className="setup-error">
          {unavailable.length} selected resources are no longer available.{" "}
          <Button
            variant="link"
            disabled={!canAssign || busy}
            onClick={() =>
              onChange({ resourceIds: draft.resourceIds.filter((id) => !unavailable.includes(id)) })
            }
          >
            Remove unavailable resources
          </Button>
        </div>
      )}
      {(catalog.error || installations.error) && (
        <p role="alert" className="setup-error">
          Plugins could not be loaded.{" "}
          <Button
            variant="link"
            onClick={() => {
              void catalog.refetch();
              void update();
            }}
          >
            Try again
          </Button>
        </p>
      )}
      <div className="flex flex-wrap gap-3" aria-label="Plugins">
        {catalog.data?.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="outline"
            className={`h-auto min-w-40 justify-start gap-3 p-4 ${plugin?.id === item.id ? "setup-selected" : ""}`}
            aria-pressed={plugin?.id === item.id}
            disabled={busy || credentialDirty}
            onClick={() => {
              setPluginId(item.id);
              setInstallationId("");
              setConnecting(false);
              setError("");
            }}
          >
            {item.id === "github" ? <Github className="size-6" /> : <Plug className="size-6" />}
            <span className="text-left">
              <span className="block font-semibold">{item.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {installations.data?.some((i) => i.pluginId === item.id && i.status === "ACTIVE")
                  ? "Connected"
                  : "Connect"}
              </span>
            </span>
          </Button>
        ))}
      </div>
      {plugin && (
        <section className="space-y-5 border-t pt-6" aria-label={`${plugin.name} connection`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {installation && !connecting ? installation.name : plugin.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {installation && !connecting
                  ? installation.status === "ACTIVE"
                    ? "Connected"
                    : "Connection needs attention"
                  : "Connect this plugin to your organization."}
              </p>
            </div>
            {installation && !connecting && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !canConnect}
                  onClick={() => setConnecting(true)}
                >
                  <Plus className="mr-1 size-4" />
                  Add connection
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    busy || !canConnect || ["DISABLED", "REVOKED"].includes(installation.status)
                  }
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api.syncPluginInstallation(installation.id);
                      await update();
                    } catch (caught) {
                      setError(errorMessage(caught));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {installation.lastSyncError ? "Retry sync" : "Sync plugin"}
                </Button>
              </div>
            )}
          </div>
          {!installation || connecting ? (
            canConnect ? (
              <form onSubmit={connect} className="max-w-lg space-y-4">
                {plugin.id === "jira" && (
                  <>
                    <label className="grid gap-2 text-sm font-medium">
                      Connection name
                      <Input
                        value={values.name ?? ""}
                        required
                        disabled={busy}
                        onChange={(event) => setValues({ ...values, name: event.target.value })}
                      />
                    </label>
                    <fieldset disabled={busy} className="space-y-4">
                      <PluginConfigurationFields
                        plugin={plugin}
                        values={values}
                        onChange={(key, value) => setValues({ ...values, [key]: value })}
                        prefix="setup-plugin"
                      />
                    </fieldset>
                  </>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || !plugin.installable}>
                    {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {plugin.id === "jira" ? "Connect and sync" : `Authorize ${plugin.name}`}
                  </Button>
                  {(connecting || credentialDirty) && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setValues({ name: "Jira" });
                        setConnecting(false);
                      }}
                    >
                      Cancel connection
                    </Button>
                  )}
                </div>
                {plugin.id === "github" && (
                  <p className="text-xs text-muted-foreground">
                    You will authorize access on GitHub, then return to this step.
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                An organization admin can connect this plugin. You can continue with existing
                resources or set this up later.
              </p>
            )
          ) : (
            <>
              {connections.length > 1 && (
                <Select value={installation.id} onValueChange={setInstallationId}>
                  <SelectTrigger aria-label="Plugin connection">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((item) => (
                      <SelectItem value={item.id} key={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(installation.lastSyncError ||
                ["DISABLED", "REVOKED"].includes(installation.status)) && (
                <p role="alert" className="setup-error">
                  {installation.lastSyncError ||
                    "This connection is unavailable. Ask an organization admin to reconnect it."}
                </p>
              )}
              {busy ? (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Syncing plugin. Resources will appear here automatically.
                </p>
              ) : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search resources"
                  placeholder="Search resources"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="divide-y rounded-xl border">
                {visible.map((resource) => (
                  <label key={resource.id} className="flex cursor-pointer items-center gap-3 p-4">
                    <Checkbox
                      disabled={
                        busy ||
                        !canAssign ||
                        (installation.status !== "ACTIVE" &&
                          !draft.resourceIds.includes(resource.id))
                      }
                      checked={draft.resourceIds.includes(resource.id)}
                      onCheckedChange={(checked) =>
                        onChange({
                          resourceIds: checked
                            ? [...draft.resourceIds, resource.id]
                            : draft.resourceIds.filter((id) => id !== resource.id),
                        })
                      }
                      aria-label={resource.name}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{resource.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {resource.fullName || resource.externalId || resource.type}
                      </span>
                    </span>
                    {draft.resourceIds.includes(resource.id) && (
                      <Check className="size-4 text-[var(--brand)]" />
                    )}
                  </label>
                ))}
                {!visible.length && (
                  <p className="p-5 text-sm text-muted-foreground">
                    {search
                      ? "No matching resources."
                      : busy
                        ? "Discovering resources…"
                        : "No resources are available yet. Check access or sync the plugin."}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {draft.resourceIds.length} resources selected. Selections are applied to your team
                when you continue.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="setup-error">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
