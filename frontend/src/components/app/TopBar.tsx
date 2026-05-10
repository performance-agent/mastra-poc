import { Link } from "@tanstack/react-router";
import { HealthIndicator } from "./HealthIndicator";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";

function initials(name?: string | null, email?: string | null) {
  const source = name || email || "User";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function TopBar() {
  const { firebaseUser, signOut } = useAuth();
  const displayName = firebaseUser?.displayName || firebaseUser?.email || "User";
  const email = firebaseUser?.email || "";
  const photoUrl = firebaseUser?.photoURL || undefined;

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
          <div className="hidden items-center gap-2 rounded-md px-2 py-1 sm:flex">
            <Avatar className="h-7 w-7">
              <AvatarImage src={photoUrl} alt={displayName} />
              <AvatarFallback className="text-xs">{initials(displayName, email)}</AvatarFallback>
            </Avatar>
            <div className="max-w-40 leading-tight">
              <p className="truncate text-xs font-medium">{displayName}</p>
              {email ? <p className="truncate text-[11px] text-muted-foreground">{email}</p> : null}
            </div>
          </div>
          <Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
