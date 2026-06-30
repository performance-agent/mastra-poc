import {
  pluginResourceSchema,
  schemaFromJson,
  validateSchema,
  type PluginResource,
  type ResourceProvider,
  type ResourceTypeDefinition,
  type SecretDefinitions,
} from "@pa/core";

type DiscoveredResource = Omit<PluginResource, "type">;

export function resourceType<const TKey extends string>(definition: ResourceTypeDefinition & { readonly key: TKey }) {
  return Object.freeze(definition);
}

export function providesResources<
  TResourceType extends ResourceTypeDefinition,
  TSecrets extends SecretDefinitions,
>(
  type: TResourceType,
  input: {
    readonly secrets: TSecrets;
    discover(context: Parameters<ResourceProvider<TResourceType, TSecrets>["discover"]>[0]): Promise<readonly DiscoveredResource[]>;
  },
): ResourceProvider<TResourceType, TSecrets> {
  const listSchema = schemaFromJson<readonly PluginResource[]>({ type: "array", items: pluginResourceSchema.jsonSchema });
  return Object.freeze({
    resourceType: type,
    async discover(context) {
      const discovered = await input.discover(context);
      const resources = discovered.map((resource) => ({ ...resource, type: type.key }));
      return validateSchema(listSchema, resources, `Resource provider ${type.key} returned invalid resources`);
    },
  });
}
