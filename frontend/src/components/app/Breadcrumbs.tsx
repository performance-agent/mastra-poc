import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <TooltipProvider delayDuration={250}>
      <nav
        className="min-w-0 overflow-x-auto overflow-y-hidden text-sm text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Breadcrumb"
      >
        <ol className="flex min-w-max items-center gap-1 whitespace-nowrap">
          {items.map((c, i) => {
            const isLast = i === items.length - 1;
            const crumbClass = isLast
              ? "block max-w-[9rem] truncate rounded px-1 font-medium text-foreground sm:max-w-[14rem] lg:max-w-[20rem]"
              : "block max-w-[7rem] truncate rounded px-1 transition-colors hover:bg-accent hover:text-foreground sm:max-w-[11rem] lg:max-w-[16rem]";

            return (
              <Fragment key={i}>
                <li className="flex min-w-0 shrink-0 items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {c.onClick ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={c.onClick}
                          className={`${crumbClass} h-auto py-1`}
                        >
                          {c.label}
                        </Button>
                      ) : c.to && !isLast ? (
                        <Link to={c.to} className={crumbClass}>
                          {c.label}
                        </Link>
                      ) : (
                        <span className={crumbClass}>{c.label}</span>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs break-words">
                      {c.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
                {!isLast && (
                  <li aria-hidden="true" className="flex shrink-0 items-center">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </TooltipProvider>
  );
}
