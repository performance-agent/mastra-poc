import type { Capability, PluginDefinition, PluginInstallation } from "@pa/core";
import { FakeRuntime } from "./fake-runtime.js";

export class TestInstallationBuilder {
  private readonly runtime: FakeRuntime;
  private readonly plugin: PluginDefinition;
  private grants?: readonly Capability[];

  constructor(runtime: FakeRuntime, plugin: PluginDefinition) {
    this.runtime = runtime;
    this.plugin = plugin;
  }

  granted(permissions: readonly Capability[]): this {
    this.grants = permissions;
    return this;
  }

  install(): PluginInstallation {
    return this.runtime.install(
      this.grants ? { plugin: this.plugin, grantedCapabilities: this.grants } : { plugin: this.plugin },
    );
  }
}
