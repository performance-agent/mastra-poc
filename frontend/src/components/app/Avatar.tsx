import { useState } from "react";
import { Sparkles, Leaf, Sun, Flower2 } from "lucide-react";
import { useImageSource } from "@/lib/media";
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
  const [failedSource, setFailedSource] = useState<string>();
  const resolved = useImageSource(src?.startsWith("avatar:") ? undefined : src);
  const avatar = src?.startsWith("avatar:") ? src.slice(7) : "";
  const colors: Record<string, string> = {
    iris: "#7262d9",
    fern: "#176c65",
    sun: "#a45728",
    rose: "#a14b70",
  };
  const AvatarIcon =
    ({ iris: Sparkles, fern: Leaf, sun: Sun, rose: Flower2 } as const)[avatar as "iris"] ??
    Sparkles;
  const sizes = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-16 w-16 text-base",
  };
  return (
    <div
      style={
        avatar
          ? {
              color: colors[avatar] ?? colors.iris,
              backgroundColor: `color-mix(in srgb, ${colors[avatar] ?? colors.iris} 14%, var(--card))`,
            }
          : undefined
      }
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-[var(--brand-soft)] font-semibold text-[var(--brand-ink)]",
        sizes[size],
        className,
      )}
    >
      {resolved && failedSource !== resolved ? (
        <img
          src={resolved}
          onError={() => setFailedSource(resolved)}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : avatar ? (
        <AvatarIcon aria-hidden className="h-1/2 w-1/2" />
      ) : (
        <span>{initials(name) || "U"}</span>
      )}
    </div>
  );
}
