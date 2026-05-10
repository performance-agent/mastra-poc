import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function ContextTabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="border-b border-border">
      <div className="-mb-px flex min-h-11 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className={cn(
                "relative flex shrink-0 items-center whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {typeof t.count === "number" && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t.count}
                  </span>
                )}
              </span>
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
