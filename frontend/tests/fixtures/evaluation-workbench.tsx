import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EvaluationWorkbench } from "../../src/components/app/EvaluationWorkbench";
import "../../src/styles.css";

const client = new QueryClient();

function Harness() {
  const [group, setGroup] = useState("group-a");
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-7xl p-6">
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          UI TEST — SIMULATED API RESPONSES. These screenshots are not a live agent evaluation.
        </p>
        <div className="mb-4 flex gap-4">
          <button onClick={() => setGroup("group-a")}>Test group A</button>
          <button onClick={() => setGroup("group-b")}>Test group B</button>
        </div>
        <EvaluationWorkbench
          workspaceId="workspace-test"
          groupId={group}
          groupName={group === "group-a" ? "Test group A" : "Test group B"}
        />
      </main>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("progress-test-root")!).render(<Harness />);
