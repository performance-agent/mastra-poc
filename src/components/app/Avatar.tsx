import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-16 w-16 text-base",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted font-semibold text-muted-foreground",
        sizes[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initials(name) || "•"}</span>
      )}
    </div>
  );
}
