import type {
  ConnectionClientMap,
  ConnectionClients,
  ConnectionDefinition,
  DataProvider,
  DataProviderMode,
  DataTypeDefinition,
} from "@pa/core";

type ProviderInput<TData, TQuery, TConnections extends ConnectionClients> = {
  mode: DataProviderMode;
  resources?: readonly string[];
  query: DataProvider<TData, TQuery, TConnections>["query"];
};

function defineDataProvider<TData, TQuery, TConnections extends ConnectionClients = ConnectionClients>(
  contract: DataTypeDefinition<TData, TQuery>,
  provider: ProviderInput<TData, TQuery, TConnections>,
): DataProvider<TData, TQuery, TConnections> {
  const definition: DataProvider<TData, TQuery, TConnections> = {
    contract,
    mode: provider.mode,
    query: provider.query,
  };
  if (provider.resources) definition.resources = provider.resources;
  return definition;
}

export const providesData = Object.assign(defineDataProvider, {
  withConnections<TConnectionDefinitions extends Record<string, ConnectionDefinition>>(
    _connections: TConnectionDefinitions,
  ) {
    return <TData, TQuery>(
      contract: DataTypeDefinition<TData, TQuery>,
      provider: ProviderInput<TData, TQuery, ConnectionClientMap<TConnectionDefinitions>>,
    ): DataProvider<TData, TQuery, ConnectionClientMap<TConnectionDefinitions>> => defineDataProvider(contract, provider);
  },
});
