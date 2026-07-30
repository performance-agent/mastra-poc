import type {
  MissingEvidenceRequirement,
  ResourceSelectedRule,
  SelectedResource,
} from "../evaluationPlan/types.js";
import type { ResourceCatalogNodeResult } from "../resourceCatalog/types.js";
import type { UnderstoodRule } from "../ruleUnderstanding/types.js";

export type ResourceSelectionInput = {
  understoodRule: UnderstoodRule;
  resourceCatalog: ResourceCatalogNodeResult;
};

export type ResourceSelectionDecision = {
  selectedResources: SelectedResource[];
  missingEvidence: MissingEvidenceRequirement[];
};

export type ResourceSelector = {
  select(input: ResourceSelectionInput): Promise<unknown>;
};

export type ResourceSelectionFailureCode =
  | "selection_failed"
  | "invalid_selection"
  | "unknown_resource"
  | "unknown_operation";

export type FailedResourceSelection = {
  understoodRule: UnderstoodRule;
  code: ResourceSelectionFailureCode;
  message: string;
  resourceId?: string;
  operationName?: string;
};

export type ResourceSelectionNodeStatus = "ready" | "partial" | "failed";

export type ResourceSelectionNodeResult = {
  status: ResourceSelectionNodeStatus;
  selectedRules: ResourceSelectedRule[];
  failedRules: FailedResourceSelection[];
};

export type ResourceSelectionNode = {
  run(input: {
    understoodRules: readonly UnderstoodRule[];
    resourceCatalog: ResourceCatalogNodeResult;
  }): Promise<ResourceSelectionNodeResult>;
};

