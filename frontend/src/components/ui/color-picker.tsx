import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const COLORS = ["#7262d9", "#176c65", "#2868b8", "#a14b70", "#a45728", "#475569"];
export function ColorPicker({
  value,
  onChange,
  disabled,
  label = "Accent color",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={label}
            aria-invalid={!valid}
            aria-describedby={!valid ? id + "-error" : undefined}
            className="justify-start gap-3"
          >
            <span
              aria-hidden
              className="h-5 w-5 rounded-md border"
              style={{ backgroundColor: valid ? value : "transparent" }}
            />
            <span className="font-mono text-xs">
              {valid ? value.toUpperCase() : "Invalid color"}
            </span>
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={label}
          className="w-72 max-w-[calc(100vw-2rem)] space-y-4"
        >
          <div className="grid grid-cols-6 gap-2" role="group" aria-label="Color palette">
            {COLORS.map((color) => (
              <Button
                key={color}
                type="button"
                variant="outline"
                size="icon"
                className="relative h-8 w-8 overflow-hidden"
                aria-label={"Use accent " + color}
                aria-pressed={value.toLowerCase() === color}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-1 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {value.toLowerCase() === color && (
                  <Check
                    aria-hidden
                    className="relative rounded-full bg-background p-0.5 text-foreground"
                  />
                )}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor={id}>Hex color</Label>
            <Input
              id={id}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (valid) setOpen(false);
                }
              }}
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              placeholder="#7262D9"
              aria-invalid={!valid}
              aria-describedby={id + "-hint"}
              className="font-mono"
            />
            <p id={id + "-hint"} className="text-xs text-muted-foreground">
              Use # followed by six hexadecimal digits.
            </p>
          </div>
        </PopoverContent>
      </Popover>
      {!valid && (
        <p id={id + "-error"} role="alert" className="text-xs text-destructive">
          Enter a valid color, for example #7262D9.
        </p>
      )}
    </div>
  );
}
