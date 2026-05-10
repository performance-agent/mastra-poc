import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={i}>
            {c.to && !isLast ? (
              <Link
                to={c.to}
                className="rounded px-1 transition-colors hover:bg-accent hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? "px-1 font-medium text-foreground" : "px-1"}>
                {c.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
