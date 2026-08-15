DROP INDEX "PluginInstallation_pluginId_externalId_key";

CREATE UNIQUE INDEX "PluginInstallation_organizationId_pluginId_externalId_key"
ON "PluginInstallation"("organizationId", "pluginId", "externalId");
