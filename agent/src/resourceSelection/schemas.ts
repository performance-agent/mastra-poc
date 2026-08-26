import { z } from 'zod';
import {
  missingEvidenceRequirementSchema,
  selectedResourceSchema,
} from '../evaluationPlan/schemas.js';

export const resourceSelectionAiOutputSchema = z
  .object({
    selectedResources: z.array(selectedResourceSchema),
    missingEvidence: z.array(missingEvidenceRequirementSchema),
  })
  .strict();

export type ResourceSelectionAiOutput = z.infer<
  typeof resourceSelectionAiOutputSchema
>;
