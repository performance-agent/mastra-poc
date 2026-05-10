import { Link } from "@tanstack/react-router";
import { HealthIndicator } from "./HealthIndicator";
import { Users } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/organizations" className="group flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            PA
          </div>
          <span className="text-sm font-semibold tracking-tight">Performance Agent</span>
        </Link>
        <div className="flex items-center gap-2">
          <HealthIndicator />
          <Link
            to="/users"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "bg-accent text-foreground" }}
          >
            <Users className="h-3.5 w-3.5" />
            Users
          </Link>
        </div>
      </div>
    </header>
  );
}
