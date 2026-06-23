import type { SetupDefinition, SetupField, SetupSection } from "@pa/core";

type BaseField = { key: string; label: string; required?: boolean };

export const ui = {
  section(title: string, fields: readonly SetupField[]): SetupSection {
    return { type: "section", title, fields };
  },
  definition(sections: readonly SetupSection[]): SetupDefinition {
    return { sections };
  },
  text(input: BaseField): SetupField {
    return { type: "text", ...input };
  },
  number(input: BaseField): SetupField {
    return { type: "number", ...input };
  },
  boolean(input: BaseField): SetupField {
    return { type: "boolean", ...input };
  },
  secret(input: BaseField): SetupField {
    return { type: "secret", ...input };
  },
  select(input: BaseField & { options: readonly string[] }): SetupField {
    return { type: "select", ...input };
  },
  multiSelect(input: BaseField & { options: readonly string[] }): SetupField {
    return { type: "multiSelect", ...input };
  },
  connection(input: BaseField & { connectionType: string }): SetupField {
    return { type: "connection", ...input };
  },
  resourcePicker(input: BaseField & { resourceType: string }): SetupField {
    return { type: "resourcePicker", ...input };
  },
};
