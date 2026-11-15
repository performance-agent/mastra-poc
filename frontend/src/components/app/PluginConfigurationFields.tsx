import { Input } from "@/components/ui/input";
import type { PluginCatalogItem } from "@/lib/types";

export function PluginConfigurationFields({
  plugin,
  values,
  onChange,
  prefix = "plugin",
  editing = false,
}: {
  plugin: PluginCatalogItem;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  prefix?: string;
  editing?: boolean;
}) {
  return (
    <>
      {plugin.configurationFields
        .filter((field) => field.configurable)
        .map((field) => (
          <label
            key={field.key}
            className="grid gap-2 text-sm font-medium"
            htmlFor={`${prefix}-${field.key}`}
          >
            {field.label}
            <Input
              id={`${prefix}-${field.key}`}
              required={field.required && !(editing && field.sensitive)}
              placeholder={
                editing && field.sensitive ? "Leave blank to keep the current value" : undefined
              }
              type={
                field.sensitive
                  ? "password"
                  : field.key === "email"
                    ? "email"
                    : field.key === "siteUrl"
                      ? "url"
                      : "text"
              }
              autoComplete={field.sensitive ? "off" : undefined}
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
            {field.description && (
              <span className="text-xs font-normal text-muted-foreground">{field.description}</span>
            )}
          </label>
        ))}
    </>
  );
}
