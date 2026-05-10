import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "checking" | "ok" | "down";

export function HealthIndicator() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setStatus("ok");
      } catch (e) {
        if (active) setStatus(e instanceof ApiError && e.statusCode !== 0 ? "ok" : "down");
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const label =
    status === "checking" ? "Checking" : status === "ok" ? "API online" : "API offline";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "ok" && "bg-success",
          status === "down" && "bg-destructive",
          status === "checking" && "bg-muted-foreground/60 animate-pulse",
        )}
      />
      {label}
    </div>
  );
}
