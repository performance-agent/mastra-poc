import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const labels: Record<string, string> = {
  classification: "Suggested execution",
  explanation: "Explanation",
  repeatability: "Repeatability",
  ambiguity: "Ambiguity",
  verificationEffort: "Verification effort",
  humanJudgment: "Human judgment",
  human: "Human",
  ai: "AI",
  hybrid: "Human + AI",
  insufficient_information: "Insufficient information",
};
const sources: Record<string, string> = {
  "jira.issue": "Jira",
  "github.issue": "GitHub Issue",
  "github.pullRequest": "Pull Request",
};
type Task = Awaited<ReturnType<typeof api.listStoredTasks>>[number];
const title = (task: Task) => String(task.payload.title ?? task.payload.summary ?? task.externalId);
const identifier = (task: Task) =>
  String(task.payload.key ?? (task.payload.number ? `#${task.payload.number}` : task.externalId));

export function TaskAnalysis({ workspaceId, groupId }: { workspaceId: string; groupId: string }) {
  const id = useId();
  const [mode, setMode] = useState("search");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Task>();
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<{ source: string; data: Record<string, string> }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const tasks = useQuery({
    queryKey: ["stored-tasks", workspaceId, groupId, debounced],
    queryFn: () => api.listStoredTasks(workspaceId, groupId, debounced),
  });
  const sync = useQuery({
    queryKey: ["sync-status", workspaceId, groupId],
    queryFn: () => api.syncStatus(workspaceId, groupId),
  });
  const searching = tasks.isFetching || search.trim() !== debounced;
  const clearResult = () => {
    setResult(undefined);
    setError("");
  };
  const run = async () => {
    if (pending || (mode === "search" ? !selected : !description.trim())) return;
    setOpen(false);
    setPending(true);
    clearResult();
    const source =
      mode === "search" && selected
        ? `${sources[selected.operation] ?? "Task"} · ${identifier(selected)} · ${title(selected)}`
        : description.trim();
    try {
      const saved = await api.analyzeTask(workspaceId, {
        groupId,
        ...(mode === "search" && selected
          ? { recordId: selected.id }
          : { description: description.trim() }),
      });
      setResult({ source, data: saved.result });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card className="mt-4 px-5">
      <Accordion type="single" collapsible>
        <AccordionItem value="analysis" className="border-0">
          <AccordionTrigger>Task analysis</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Analyze how a task could be carried out. This does not evaluate the collaborator or
              affect their grade.
            </p>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                if (!pending) {
                  setMode(value);
                  clearResult();
                  setOpen(false);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="search" disabled={pending}>
                  Find task
                </TabsTrigger>
                <TabsTrigger value="description" disabled={pending}>
                  Write description
                </TabsTrigger>
              </TabsList>
              <TabsContent value="search" className="space-y-3">
                {selected && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{sources[selected.operation] ?? "Task"}</Badge>
                      <span className="break-all text-xs text-muted-foreground">
                        {identifier(selected)}
                      </span>
                    </div>
                    <p className="break-words text-sm font-medium">{title(selected)}</p>
                    {typeof selected.payload.repository === "string" && (
                      <p className="break-all text-xs text-muted-foreground">
                        {selected.payload.repository}
                      </p>
                    )}
                  </div>
                )}
                <Popover
                  open={open && !pending}
                  onOpenChange={(value) => {
                    if (!pending) setOpen(value);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={pending}
                      aria-haspopup="dialog"
                      aria-expanded={open}
                      className="w-full justify-between sm:w-auto"
                    >
                      {selected ? "Change task" : "Find a saved task"}
                      <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[min(32rem,calc(100vw-2rem))] p-0"
                    aria-label="Find a saved task"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        aria-label="Search tasks by identifier or title"
                        placeholder="Search by identifier or title…"
                        value={search}
                        onValueChange={setSearch}
                        disabled={pending}
                      />
                      <CommandList aria-label="Saved tasks" aria-busy={searching}>
                        {searching ? (
                          <p role="status" className="p-4 text-sm text-muted-foreground">
                            Searching tasks…
                          </p>
                        ) : tasks.isError ? (
                          <div className="p-4">
                            <p role="alert" className="text-sm text-destructive">
                              {errorMessage(tasks.error)}
                            </p>
                            <Button variant="ghost" onClick={() => void tasks.refetch()}>
                              Retry
                            </Button>
                          </div>
                        ) : !tasks.data?.length ? (
                          <p role="status" className="p-4 text-sm text-muted-foreground">
                            {debounced
                              ? "No matching tasks. Try another identifier or title."
                              : "This project has no saved tasks yet."}
                          </p>
                        ) : (
                          tasks.data.map((task) => (
                            <CommandItem
                              key={task.id}
                              value={task.id}
                              disabled={pending}
                              onSelect={() => {
                                setSelected(task);
                                setOpen(false);
                                clearResult();
                              }}
                              className="items-start py-3"
                            >
                              <Check
                                aria-hidden="true"
                                className={
                                  selected?.id === task.id ? "mt-1 opacity-100" : "mt-1 opacity-0"
                                }
                              />
                              <span className="min-w-0 flex-1 space-y-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="break-all text-xs font-medium">
                                    {identifier(task)}
                                  </span>
                                  <Badge variant="secondary">
                                    {sources[task.operation] ?? "Task"}
                                  </Badge>
                                  {selected?.id === task.id && (
                                    <span className="sr-only">Selected</span>
                                  )}
                                </span>
                                <span className="line-clamp-2 break-words" title={title(task)}>
                                  {title(task)}
                                </span>
                                {typeof task.payload.repository === "string" && (
                                  <span className="block break-all text-xs text-muted-foreground">
                                    {task.payload.repository}
                                  </span>
                                )}
                              </span>
                            </CommandItem>
                          ))
                        )}
                      </CommandList>
                      {!searching && !tasks.isError && tasks.data?.length === 100 && (
                        <p role="status" className="border-t p-3 text-xs text-muted-foreground">
                          Showing 100 matches. Refine your search to find more specific tasks.
                        </p>
                      )}
                    </Command>
                  </PopoverContent>
                </Popover>
              </TabsContent>
              <TabsContent value="description" className="space-y-2">
                <Label htmlFor={`${id}-description`}>Task description</Label>
                <Textarea
                  id={`${id}-description`}
                  className="min-h-28"
                  disabled={pending}
                  placeholder="Describe the task, expected output, and acceptance criteria"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    clearResult();
                  }}
                />
              </TabsContent>
            </Tabs>
            <Button
              disabled={pending || (mode === "search" ? !selected : !description.trim())}
              onClick={() => void run()}
            >
              {pending ? "Analyzing…" : "Analyze task"}
            </Button>
            {pending && (
              <p role="status" className="text-sm text-muted-foreground">
                Analyzing the selected input…
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {result && (
              <section
                aria-label="Task analysis result"
                className="space-y-4 rounded-lg border p-4"
              >
                <div>
                  <h4 className="font-medium">Analysis result</h4>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {result.source}
                  </p>
                </div>
                <dl className="space-y-3">
                  {result.data.classification && (
                    <div className="rounded-lg bg-muted p-3">
                      <dt className="mb-2 text-sm font-medium">Suggested execution</dt>
                      <dd>
                        <Badge>
                          {labels[result.data.classification] ?? result.data.classification}
                        </Badge>
                      </dd>
                    </div>
                  )}
                  {Object.entries(result.data)
                    .filter(([key]) => key !== "classification")
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-medium">
                          {labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}
                        </dt>
                        <dd className="mt-1 break-words text-muted-foreground">
                          {labels[value] ?? value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}
            <Accordion type="single" collapsible>
              <AccordionItem value="sync" className="border-0">
                <AccordionTrigger className="text-muted-foreground">
                  Evidence freshness
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                  {sync.isPending ? (
                    <p role="status">Loading synchronization status…</p>
                  ) : sync.isError ? (
                    <p role="alert">{errorMessage(sync.error)}</p>
                  ) : !sync.data?.length ? (
                    <p>No synchronization information available.</p>
                  ) : (
                    sync.data.map((s) => (
                      <p key={`${s.resourceId}/${s.operation}`} className="break-words">
                        {sources[s.operation] ?? s.operation}:{" "}
                        {s.checkpoint
                          ? new Date(s.checkpoint).toLocaleString()
                          : "No completed synchronization"}{" "}
                        {s.error}{" "}
                        {s.nextRetryAt
                          ? `Retry after ${new Date(s.nextRetryAt).toLocaleString()}`
                          : ""}
                      </p>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
