import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { FormModal } from "./FormModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DataType } from "@/lib/types";

const fieldKinds = ["string", "number", "integer", "boolean", "date", "datetime", "enum"] as const;
type FieldKind = (typeof fieldKinds)[number];

interface FieldDraft {
  id: string;
  name: string;
  kind: FieldKind;
  required: boolean;
  array: boolean;
  enumValues: string;
}

export interface DataTypeFormValues {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string(),
    fields: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().trim().min(1, "Every field needs a name"),
          kind: z.enum(fieldKinds),
          required: z.boolean(),
          array: z.boolean(),
          enumValues: z.string(),
        }),
      )
      .min(1, "Add at least one field"),
  })
  .superRefine(({ fields }, ctx) => {
    const names = new Set<string>();
    fields.forEach((field, index) => {
      const normalizedName = field.name.trim();
      if (names.has(normalizedName)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "name"],
          message: `Field “${normalizedName}” is duplicated`,
        });
      }
      names.add(normalizedName);

      if (field.kind === "enum" && enumOptions(field.enumValues).length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "enumValues"],
          message: `Enum “${normalizedName}” needs at least one value`,
        });
      }
    });
  });

let nextFieldId = 0;
function newField(): FieldDraft {
  nextFieldId += 1;
  return {
    id: `data-type-field-${nextFieldId}`,
    name: "",
    kind: "string",
    required: true,
    array: false,
    enumValues: "",
  };
}

function enumOptions(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function fieldZodSchema(field: FieldDraft): z.ZodType {
  let schema: z.ZodType;
  switch (field.kind) {
    case "number":
      schema = z.number();
      break;
    case "integer":
      schema = z.int();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "date":
      schema = z.iso.date();
      break;
    case "datetime":
      schema = z.iso.datetime();
      break;
    case "enum": {
      const values = enumOptions(field.enumValues) as [string, ...string[]];
      schema = z.enum(values);
      break;
    }
    default:
      schema = z.string();
  }

  if (field.array) schema = z.array(schema);
  return field.required ? schema : schema.optional();
}

function fieldsToJsonSchema(fields: FieldDraft[]): Record<string, unknown> {
  const shape: Record<string, z.ZodType> = {};
  fields.forEach((field) => {
    shape[field.name.trim()] = fieldZodSchema(field);
  });
  return z.toJSONSchema(z.object(shape), { target: "draft-2020-12" }) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaTypeToField(
  schema: Record<string, unknown>,
): Pick<FieldDraft, "kind" | "array" | "enumValues"> | null {
  let property = schema;
  let array = false;
  if (property.type === "array") {
    if (!isRecord(property.items)) return null;
    property = property.items;
    array = true;
  }

  if (Array.isArray(property.enum) && property.enum.every((value) => typeof value === "string")) {
    return { kind: "enum", array, enumValues: property.enum.join(", ") };
  }
  if (property.type === "integer") return { kind: "integer", array, enumValues: "" };
  if (property.type === "number") return { kind: "number", array, enumValues: "" };
  if (property.type === "boolean") return { kind: "boolean", array, enumValues: "" };
  if (property.type === "string" && property.format === "date") {
    return { kind: "date", array, enumValues: "" };
  }
  if (property.type === "string" && property.format === "date-time") {
    return { kind: "datetime", array, enumValues: "" };
  }
  if (property.type === "string" && property.format === undefined) {
    return { kind: "string", array, enumValues: "" };
  }
  return null;
}

function jsonSchemaToFields(schema: Record<string, unknown>): FieldDraft[] | null {
  if (schema.type !== "object" || !isRecord(schema.properties)) return null;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields: FieldDraft[] = [];

  for (const [name, property] of Object.entries(schema.properties)) {
    if (!isRecord(property)) return null;
    const parsed = schemaTypeToField(property);
    if (!parsed) return null;
    fields.push({ ...newField(), ...parsed, name, required: required.has(name) });
  }
  return fields.length > 0 ? fields : null;
}

export function DataTypeFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DataType | null;
  onSubmit: (values: DataTypeFormValues) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>([newField()]);
  const [schemaEditable, setSchemaEditable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parsedFields = initial ? jsonSchemaToFields(initial.schema) : [newField()];
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setFields(parsedFields ?? []);
    setSchemaEditable(!initial || parsedFields !== null);
    setError(null);
  }, [initial, open]);

  const updateField = (id: string, patch: Partial<FieldDraft>) => {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
    setError(null);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit data type" : "New data type"}
      description="Define the data shape available to performance agents."
      submitLabel={initial ? "Save" : "Create"}
      submitting={submitting}
      contentClassName="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
      onSubmit={async () => {
        setError(null);
        let schema: Record<string, unknown> | undefined;

        if (schemaEditable) {
          const result = formSchema.safeParse({ name, description, fields });
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Review the form fields");
            return;
          }
          schema = fieldsToJsonSchema(result.data.fields);
        } else if (!name.trim()) {
          setError("Name is required");
          return;
        }

        setSubmitting(true);
        try {
          await onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
            ...(schema ? { schema } : {}),
          });
          onOpenChange(false);
        } catch {
          // The caller reports API errors and the dialog remains open for correction or retry.
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="data-type-name">Name</Label>
          <Input
            id="data-type-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="data-type-description">Description</Label>
          <Textarea
            id="data-type-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {schemaEditable ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Fields</Label>
              <p className="text-xs text-muted-foreground">
                Configure the properties in this data type.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFields((current) => [...current, newField()])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add field
            </Button>
          </div>

          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.9fr)_6rem_5rem_2.25rem] gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Field name</span>
            <span>Type</span>
            <span>Required</span>
            <span>Array</span>
            <span className="sr-only">Actions</span>
          </div>

          <div className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-border">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-2 gap-3 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.9fr)_6rem_5rem_2.25rem] sm:items-center sm:border-0 sm:py-2"
              >
                <div className="col-span-2 space-y-1.5 sm:col-span-1 sm:space-y-0">
                  <Label className="sm:sr-only" htmlFor={`${field.id}-name`}>
                    Field name
                  </Label>
                  <Input
                    id={`${field.id}-name`}
                    className="h-8"
                    value={field.name}
                    placeholder={`field_${index + 1}`}
                    onChange={(event) => updateField(field.id, { name: event.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-1.5 sm:col-span-1 sm:space-y-0">
                  <Label className="sm:sr-only">Type</Label>
                  <Select
                    value={field.kind}
                    onValueChange={(kind) => updateField(field.id, { kind: kind as FieldKind })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldKinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(field.id, { required: checked === true })
                    }
                  />
                  <span className="sm:sr-only">Required</span>
                </label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.array}
                    onCheckedChange={(checked) =>
                      updateField(field.id, { array: checked === true })
                    }
                  />
                  <span className="sm:sr-only">Array</span>
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="col-span-2 h-8 w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:col-span-1 sm:w-8"
                  aria-label={`Remove ${field.name || "field"}`}
                  onClick={() =>
                    setFields((current) => current.filter((item) => item.id !== field.id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2 sm:sr-only">Remove field</span>
                </Button>
                {field.kind === "enum" && (
                  <div className="col-span-2 space-y-1.5 border-t border-border pt-2 sm:col-span-5 sm:-mx-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-3 sm:space-y-0 sm:px-3">
                    <Label htmlFor={`${field.id}-enum`}>Allowed values</Label>
                    <Input
                      id={`${field.id}-enum`}
                      className="h-8"
                      value={field.enumValues}
                      placeholder="planned, active, completed"
                      onChange={(event) =>
                        updateField(field.id, { enumValues: event.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Read-only schema</p>
            <p className="text-xs text-muted-foreground">
              This schema contains structures the visual editor cannot safely represent. You can
              still update its name and description.
            </p>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-3 text-xs">
            {JSON.stringify(initial?.schema, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FormModal>
  );
}
