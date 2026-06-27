import {
  PluginValidationError,
  pluginResourceSchema,
  type ResourceTypeDefinition,
  type ResourcesProvider,
  type SecretDefinitions,
} from "@pa/core";

export function resourceType<const TKey extends string>(definition: ResourceTypeDefinition & { readonly key: TKey }) {
  return Object.freeze(definition);
}

export function resourcesProvider<TSecrets extends SecretDefinitions>(
  input: ResourcesProvider<TSecrets> & { readonly secrets: TSecrets },
): ResourcesProvider<TSecrets> {
  return validatedResourcesProvider(input);
}

function validatedResourcesProvider<TSecrets extends SecretDefinitions>(input: ResourcesProvider<TSecrets>): ResourcesProvider<TSecrets> {
  const allowedTypes = new Set(input.resourceTypes.map((resource) => resource.key));
  return Object.freeze({
    resourceTypes: Object.freeze([...input.resourceTypes]),
    async discover(context) {
      const result = await pluginResourceSchema.array().safeParseAsync(await input.discover(context));
      if (!result.success) {
        throw new PluginValidationError("Resources provider returned invalid resources", { cause: result.error });
      }
      const unexpected = result.data.find((resource) => !allowedTypes.has(resource.type));
      if (unexpected) throw new PluginValidationError(`Resources provider returned undeclared type: ${unexpected.type}`);
      return result.data;
    },
  });
}
