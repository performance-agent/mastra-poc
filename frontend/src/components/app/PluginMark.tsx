import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

/** Provider identity for the integration catalog. */
export function PluginMark({ pluginId, className }: { pluginId: string; className?: string }) {
  if (pluginId === "github")
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn("size-12 shrink-0 text-foreground", className)}
        fill="currentColor"
      >
        <path d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.42-1.305.763-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.467-2.381 1.235-3.221-.135-.303-.54-1.524.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.045.138 3.003.404 2.28-1.552 3.285-1.23 3.285-1.23.645 1.652.24 2.873.12 3.176.765.84 1.23 1.911 1.23 3.221 0 4.609-2.805 5.622-5.475 5.921.42.36.81 1.096.81 2.221 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  if (pluginId === "jira")
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-12 shrink-0", className)}>
        <path fill="#2684ff" d="M20 2h9a1 1 0 0 1 1 1v9a7 7 0 0 1-7-7h-3z" />
        <path fill="#0065ff" d="M11 11h9a1 1 0 0 1 1 1v9a7 7 0 0 1-7-7h-3z" />
        <path fill="#0052cc" d="M2 20h9a1 1 0 0 1 1 1v9a7 7 0 0 1-7-7H2z" />
      </svg>
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-ink)]",
        className,
      )}
    >
      <Plug className="size-7" />
    </span>
  );
}
