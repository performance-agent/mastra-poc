import { dataTypeKey, type DataRecord, type DataTypeDefinition } from "@pa/core";

export function dataType<TData, TQuery = Record<string, unknown>>(input: {
  id: string;
  version: string;
}): DataTypeDefinition<TData, TQuery> {
  return {
    id: input.id,
    version: input.version,
    key: dataTypeKey(input.id, input.version),
    record(record: DataRecord<TData>): DataRecord<TData> {
      return record;
    },
  };
}
