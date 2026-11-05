// Keep the ESM agent package lazy while allowing report orchestration to be tested independently.
export function reportAgentTools() {
  return import('@pa/agent');
}
