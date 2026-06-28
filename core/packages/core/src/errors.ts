export class PluginValidationError extends Error {
  readonly code = "PLUGIN_VALIDATION_ERROR";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PluginValidationError";
  }
}
