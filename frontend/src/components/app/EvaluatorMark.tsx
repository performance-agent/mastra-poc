import { createElement, type CSSProperties } from "react";

import { registerCuteIcon } from "@/lib/cute-icon.js";
import { avatarParts, type CuteState } from "@/lib/evaluator-avatars";
import { cn } from "@/lib/utils";

export function EvaluatorMark({
  name,
  avatar,
  state = "idle",
  size = 40,
  color,
  className,
}: {
  name: string;
  avatar: number;
  state?: CuteState;
  size?: number;
  color?: string | null;
  className?: string;
}) {
  registerCuteIcon();
  const { variant, hex } = avatarParts(avatar);
  const tint = color === null ? undefined : (color ?? hex);
  const style = {
    ...(tint ? { "--cute-color": tint } : {}),
    "--cute-size": `${size}px`,
  } as CSSProperties;
  return createElement("cute-icon", {
    variant,
    state,
    className: cn("shrink-0", className),
    style,
    "aria-label": name,
  });
}
