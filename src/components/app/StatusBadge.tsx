import { cn } from "@/lib/utils";

export function StatusBadge({
  variant = "neutral",
  children,
}: {
  variant?: "neutral" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const map = {
    neutral: "bg-muted text-muted-foreground border border-border",
    success: "bg-success/10 text-success border border-success/20",
    warning: "bg-warning/10 text-warning border border-warning/20",
    danger: "bg-destructive/10 text-destructive border border-destructive/20",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        map[variant],
      )}
    >
      {children}
    </span>
  );
}
