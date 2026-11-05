import type { QueryClient } from "@tanstack/react-query";
import type { Evaluator } from "./types";

export function evaluatorConfigurationHref(
  organizationId: string,
  evaluator: Pick<Evaluator, "id" | "scope" | "workspaceId" | "groupId">,
) {
  const root = `/organizations/${encodeURIComponent(organizationId)}/workspaces/${encodeURIComponent(evaluator.workspaceId)}`;
  const path =
    evaluator.scope === "WORKSPACE"
      ? root
      : `${root}/groups/${encodeURIComponent(evaluator.groupId!)}`;
  return `${path}?tab=${evaluator.scope === "WORKSPACE" ? "evaluators" : "evaluation"}&evaluatorId=${encodeURIComponent(evaluator.id)}`;
}

export function invalidateEvaluatorQueries(client: QueryClient) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      (queryKey[0] === "group" || queryKey[0] === "workspace") &&
      ["evaluators", "personalities", "people"].includes(String(queryKey[2])),
  });
}
