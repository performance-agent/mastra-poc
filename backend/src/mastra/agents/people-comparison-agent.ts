import { Agent } from '@mastra/core/agent';
import { groupReportModels } from '../model-configuration';
import { PEOPLE_COMPARISON_INSTRUCTIONS } from '../../workspaces/people-comparison.schema';

export { PEOPLE_COMPARISON_INSTRUCTIONS };

export const peopleComparisonAgent = new Agent({
  id: 'people-comparison-agent',
  name: 'Workspace People Comparison',
  instructions: PEOPLE_COMPARISON_INSTRUCTIONS,
  model: ({ requestContext }) => {
    const models = groupReportModels();
    const selected = requestContext.get('generationModel');
    return typeof selected === 'string' && models.includes(selected)
      ? selected
      : models[0];
  },
});
