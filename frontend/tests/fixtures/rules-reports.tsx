import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RulesTab } from "../../src/components/app/RulesTab";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <main className="mx-auto max-w-6xl p-6">
      <h1>ATTENTI — Rules (datos simulados)</h1>
      <RulesTab workspaceId="workspace-test" groupId="attenti" canManage />
    </main>
  </QueryClientProvider>,
);
