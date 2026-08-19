import { Agent } from '@mastra/core/agent';
import { GROUP_REPORT_INSTRUCTIONS } from '../group-report-instructions';
import { modelFromEnvironment } from '../model-configuration';

export const groupReportAgent = new Agent({
  id: 'group-report-agent',
  name: 'Group Report Agent',
  instructions: GROUP_REPORT_INSTRUCTIONS,
  model: modelFromEnvironment('GROUP_REPORT_MODEL'),
});
