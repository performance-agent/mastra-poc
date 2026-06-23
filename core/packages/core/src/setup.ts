export type SetupField =
  | { type: "text"; key: string; label: string; required?: boolean }
  | { type: "number"; key: string; label: string; required?: boolean }
  | { type: "boolean"; key: string; label: string; required?: boolean }
  | { type: "secret"; key: string; label: string; required?: boolean }
  | { type: "select"; key: string; label: string; options: readonly string[]; required?: boolean }
  | { type: "multiSelect"; key: string; label: string; options: readonly string[]; required?: boolean }
  | { type: "connection"; key: string; label: string; connectionType: string; required?: boolean }
  | { type: "resourcePicker"; key: string; label: string; resourceType: string; required?: boolean };

export type SetupFieldDefinition = SetupField;

export type SetupSection = {
  type: "section";
  title: string;
  fields: readonly SetupField[];
};

export type SetupDefinition = {
  sections: readonly SetupSection[];
};
