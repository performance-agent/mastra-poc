import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Github,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Entity = {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Workspace = Entity & {
  organizationId: string;
};

type Group = Entity & {
  workspaceId: string;
};

type ApiState = {
  ok: boolean;
  message: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.message ??
      payload?.error ??
      `Request failed with status ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  return payload as T;
}

function emptyEntityForm() {
  return {
    name: "",
    description: "",
    photoUrl: "",
  };
}

function githubSetupDefaultsFromQuery() {
  const params = new URLSearchParams(window.location.search);

  return {
    installationId:
      params.get("installation_id") ?? params.get("installationId") ?? "",
    setupAction: params.get("setup_action") ?? params.get("setupAction") ?? "install",
    password: "",
  };
}

function payloadFromEntityForm(form: ReturnType<typeof emptyEntityForm>) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    photoUrl: form.photoUrl.trim() || undefined,
  };
}

export default function App() {
  const [apiState, setApiState] = useState<ApiState>({
    ok: false,
    message: "Checking API...",
  });
  const [organizations, setOrganizations] = useState<Entity[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [organizationForm, setOrganizationForm] = useState(emptyEntityForm);
  const [workspaceForm, setWorkspaceForm] = useState(emptyEntityForm);
  const [groupForm, setGroupForm] = useState(emptyEntityForm);
  const [githubForm, setGithubForm] = useState(githubSetupDefaultsFromQuery);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [lastError, setLastError] = useState("");

  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const visibleGroups = useMemo(
    () =>
      selectedWorkspaceId
        ? groups.filter((group) => group.workspaceId === selectedWorkspaceId)
        : groups,
    [groups, selectedWorkspaceId],
  );

  async function runAction<T>(action: () => Promise<T>) {
    setLoading(true);
    setLastError("");
    try {
      const result = await action();
      setLastResult(result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected request error";
      setLastError(message);
      setLastResult({ error: message });
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function refreshOrganizations() {
    const data = await request<Entity[]>("/organizations");
    setOrganizations(data);
    if (!selectedOrganizationId && data[0]) {
      setSelectedOrganizationId(data[0].id);
    }
    return data;
  }

  async function refreshWorkspaces(organizationId = selectedOrganizationId) {
    if (!organizationId) {
      setWorkspaces([]);
      setSelectedWorkspaceId("");
      return [];
    }
    const data = await request<Workspace[]>(
      `/organizations/${organizationId}/workspaces`,
    );
    setWorkspaces(data);
    if (!data.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(data[0]?.id ?? "");
    }
    return data;
  }

  async function refreshGroups() {
    const data = await request<Group[]>("/groups");
    setGroups(data);
    if (!data.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(data[0]?.id ?? "");
    }
    return data;
  }

  async function refreshAll() {
    await runAction(async () => {
      const organizationData = await refreshOrganizations();
      const organizationId = selectedOrganizationId || organizationData[0]?.id;
      await refreshWorkspaces(organizationId);
      await refreshGroups();
      setApiState({ ok: true, message: "API reachable" });
      return {
        organizations: organizationData.length,
        workspaces: organizationId ? "loaded" : "no organization selected",
        groups: "loaded",
      };
    }).catch(() => {
      setApiState({ ok: false, message: "API unavailable" });
    });
  }

  useEffect(() => {
    void refreshAll();
    // Initial bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedOrganizationId) {
      void runAction(() => refreshWorkspaces(selectedOrganizationId)).catch(
        () => undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  function onCreateOrganization(event: FormEvent) {
    event.preventDefault();
    void runAction(async () => {
      const created = await request<Entity>("/organizations", {
        method: "POST",
        body: JSON.stringify(payloadFromEntityForm(organizationForm)),
      });
      setOrganizationForm(emptyEntityForm());
      await refreshOrganizations();
      setSelectedOrganizationId(created.id);
      return created;
    }).catch(() => undefined);
  }

  function onCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    void runAction(async () => {
      const created = await request<Workspace>(
        `/organizations/${selectedOrganizationId}/workspaces`,
        {
          method: "POST",
          body: JSON.stringify(payloadFromEntityForm(workspaceForm)),
        },
      );
      setWorkspaceForm(emptyEntityForm());
      await refreshWorkspaces(selectedOrganizationId);
      setSelectedWorkspaceId(created.id);
      return created;
    }).catch(() => undefined);
  }

  function onCreateGroup(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    void runAction(async () => {
      const created = await request<Group>("/groups", {
        method: "POST",
        body: JSON.stringify({
          ...payloadFromEntityForm(groupForm),
          workspaceId: selectedWorkspaceId,
        }),
      });
      setGroupForm(emptyEntityForm());
      await refreshGroups();
      setSelectedGroupId(created.id);
      return created;
    }).catch(() => undefined);
  }

  function onSetupGithub(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroupId) return;
    void runAction(() =>
      request("/integrations/github/setup", {
        method: "POST",
        body: JSON.stringify({
          installationId: githubForm.installationId.trim(),
          setupAction: githubForm.setupAction,
          password: githubForm.password,
          groupId: selectedGroupId,
        }),
      }),
    ).catch(() => undefined);
  }

  function onDeleteOrganization(id: string) {
    void runAction(async () => {
      const deleted = await request(`/organizations/${id}`, { method: "DELETE" });
      await refreshOrganizations();
      setSelectedOrganizationId((current) => (current === id ? "" : current));
      await refreshGroups();
      return deleted;
    }).catch(() => undefined);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Github className="h-6 w-6" />
              <Badge>GitHub setup console</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">
              Integration test bench
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Create the workspace hierarchy, then attach a GitHub installation
              to a group.
            </p>
          </div>
          <Button onClick={refreshAll} disabled={loading} variant="outline">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </header>

        <Alert
          className={
            apiState.ok
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }
        >
          <div className="flex items-start gap-2">
            {apiState.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
            ) : (
              <Server className="mt-0.5 h-4 w-4 text-amber-700" />
            )}
            <div>
              <AlertTitle>{apiState.message}</AlertTitle>
              <AlertDescription>
                Requests are sent to <code>{API_BASE_URL}</code>. Vite proxies
                <code> /api</code> to <code>http://localhost:3000</code>.
              </AlertDescription>
            </div>
          </div>
        </Alert>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Organizations</CardTitle>
                <CardDescription>
                  Pick or create the organization used for workspace tests.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreateOrganization}>
                  <Field label="Name">
                    <Input
                      required
                      value={organizationForm.name}
                      onChange={(event) =>
                        setOrganizationForm((form) => ({
                          ...form,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Acme"
                    />
                  </Field>
                  <Field label="Description">
                    <Input
                      value={organizationForm.description}
                      onChange={(event) =>
                        setOrganizationForm((form) => ({
                          ...form,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button className="w-full" disabled={loading}>
                      <Plus className="h-4 w-4" />
                      Create
                    </Button>
                  </div>
                </form>

                <div className="grid gap-2">
                  <Label htmlFor="organization">Selected organization</Label>
                  <Select
                    id="organization"
                    value={selectedOrganizationId}
                    onChange={(event) => setSelectedOrganizationId(event.target.value)}
                  >
                    <option value="">Choose organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <EntityList
                  items={organizations}
                  selectedId={selectedOrganizationId}
                  onSelect={setSelectedOrganizationId}
                  onDelete={onDeleteOrganization}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workspaces and groups</CardTitle>
                <CardDescription>
                  Groups are the owner for the GitHub integration record.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <form className="grid gap-3" onSubmit={onCreateWorkspace}>
                    <Field label="Workspace name">
                      <Input
                        required
                        disabled={!selectedOrganizationId}
                        value={workspaceForm.name}
                        onChange={(event) =>
                          setWorkspaceForm((form) => ({
                            ...form,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Engineering"
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        disabled={!selectedOrganizationId}
                        value={workspaceForm.description}
                        onChange={(event) =>
                          setWorkspaceForm((form) => ({
                            ...form,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Optional"
                      />
                    </Field>
                    <Button disabled={loading || !selectedOrganizationId}>
                      <Plus className="h-4 w-4" />
                      Create workspace
                    </Button>
                  </form>

                  <form className="grid gap-3" onSubmit={onCreateGroup}>
                    <Field label="Group name">
                      <Input
                        required
                        disabled={!selectedWorkspaceId}
                        value={groupForm.name}
                        onChange={(event) =>
                          setGroupForm((form) => ({
                            ...form,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Platform"
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        disabled={!selectedWorkspaceId}
                        value={groupForm.description}
                        onChange={(event) =>
                          setGroupForm((form) => ({
                            ...form,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Optional"
                      />
                    </Field>
                    <Button disabled={loading || !selectedWorkspaceId}>
                      <Plus className="h-4 w-4" />
                      Create group
                    </Button>
                  </form>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Selected workspace">
                    <Select
                      value={selectedWorkspaceId}
                      onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                      disabled={!selectedOrganizationId}
                    >
                      <option value="">Choose workspace</option>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Selected group">
                    <Select
                      value={selectedGroupId}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      disabled={!visibleGroups.length}
                    >
                      <option value="">Choose group</option>
                      {visibleGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <MiniPanel
                    icon={<Layers3 className="h-4 w-4" />}
                    title="Workspace context"
                    rows={[
                      ["Organization", selectedOrganization?.name ?? "None"],
                      ["Workspace", selectedWorkspace?.name ?? "None"],
                      ["Workspaces", `${workspaces.length}`],
                    ]}
                  />
                  <MiniPanel
                    icon={<Github className="h-4 w-4" />}
                    title="Group context"
                    rows={[
                      ["Visible groups", `${visibleGroups.length}`],
                      ["Selected group", selectedGroupId || "None"],
                      ["All groups", `${groups.length}`],
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle>GitHub setup</CardTitle>
                <CardDescription>
                  Sends an install setup action to the backend.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3" onSubmit={onSetupGithub}>
                  <Field label="Installation ID">
                    <Input
                      required
                      value={githubForm.installationId}
                      onChange={(event) =>
                        setGithubForm((form) => ({
                          ...form,
                          installationId: event.target.value,
                        }))
                      }
                      placeholder="12345678"
                    />
                  </Field>
                  <Field label="Setup action">
                    <Select
                      value={githubForm.setupAction}
                      onChange={(event) =>
                        setGithubForm((form) => ({
                          ...form,
                          setupAction: event.target.value,
                        }))
                      }
                    >
                      {githubForm.setupAction !== "install" ? (
                        <option value={githubForm.setupAction}>
                          {githubForm.setupAction}
                        </option>
                      ) : null}
                      <option value="install">install</option>
                    </Select>
                  </Field>
                  <Field label="Setup password">
                    <Input
                      required
                      type="password"
                      value={githubForm.password}
                      onChange={(event) =>
                        setGithubForm((form) => ({
                          ...form,
                          password: event.target.value,
                        }))
                      }
                      placeholder="Matches backend SETUP_PASSWORD"
                    />
                  </Field>
                  <Field label="Target group">
                    <Input readOnly value={selectedGroupId || "No group selected"} />
                  </Field>
                  <Button disabled={loading || !selectedGroupId}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Github className="h-4 w-4" />
                    )}
                    Run setup
                  </Button>
                </form>
              </CardContent>
            </Card>

            {lastError ? (
              <Alert className="border-red-200 bg-red-50">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-red-700" />
                  <div>
                    <AlertTitle>Request error</AlertTitle>
                    <AlertDescription>{lastError}</AlertDescription>
                  </div>
                </div>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Last response</CardTitle>
                <CardDescription>
                  Raw response payload for fast debugging.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[480px] overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100">
                  {JSON.stringify(lastResult ?? { status: "No request yet" }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EntityList({
  items,
  selectedId,
  onSelect,
  onDelete,
}: {
  items: Entity[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        No records yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
            item.id === selectedId ? "border-zinc-950 bg-zinc-50" : "border-zinc-200"
          }`}
        >
          <button
            className="min-w-0 flex-1 text-left"
            type="button"
            onClick={() => onSelect(item.id)}
          >
            <div className="truncate text-sm font-medium">{item.name}</div>
            <div className="truncate text-xs text-zinc-500">{item.id}</div>
          </button>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MiniPanel({
  icon,
  title,
  rows,
}: {
  icon: ReactNode;
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="grid gap-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-zinc-500">{label}</span>
            <span className="truncate font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
