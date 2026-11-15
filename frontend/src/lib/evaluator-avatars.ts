export const EVALUATOR_CHARACTERS = [
  { variant: "circle", label: "Round" },
  { variant: "square", label: "Square" },
  { variant: "triangle", label: "Drop" },
  { variant: "cloud", label: "Cloud" },
  { variant: "diamond", label: "Diamond" },
] as const;

export const EVALUATOR_COLORS = [
  { color: "#171717", label: "Black" },
  { color: "#FF7A21", label: "Orange" },
  { color: "#16a34a", label: "Green" },
  { color: "#9254FF", label: "Violet" },
  { color: "#2082FF", label: "Blue" },
  { color: "#FA3F94", label: "Pink" },
  { color: "#6b7280", label: "Gray" },
  { color: "#8a5a32", label: "Brown" },
  { color: "#00B8A6", label: "Teal" },
  { color: "#FF3B30", label: "Red" },
] as const;

export const CHARACTER_COUNT = EVALUATOR_CHARACTERS.length;
export const COLOR_COUNT = EVALUATOR_COLORS.length;
export const AVATAR_COUNT = CHARACTER_COUNT * COLOR_COUNT;

export type CuteState = "idle" | "hover" | "thinking" | "generating";

function wrap(value: number, count: number) {
  return ((value % count) + count) % count;
}

export function packAvatar(character: number, color: number) {
  return wrap(color, COLOR_COUNT) * CHARACTER_COUNT + wrap(character, CHARACTER_COUNT);
}

export function avatarParts(avatar: number) {
  const value = wrap(Number.isFinite(avatar) ? Math.trunc(avatar) : 0, AVATAR_COUNT);
  const character = value % CHARACTER_COUNT;
  const color = Math.floor(value / CHARACTER_COUNT);
  return {
    character,
    color,
    variant: EVALUATOR_CHARACTERS[character].variant,
    hex: EVALUATOR_COLORS[color].color,
  };
}
