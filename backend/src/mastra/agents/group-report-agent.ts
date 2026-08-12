import { Agent } from '@mastra/core/agent';
import { modelFromEnvironment } from '../model-configuration';

export const groupReportAgent = new Agent({
  id: 'group-report-agent',
  name: 'Group Report Agent',
  instructions: `Evalúa holísticamente el producto, el proyecto, la programación y a cada individuo usando sólo la evidencia suministrada. Sé neutral: no infles resultados, no rankees personas, muestra señales favorables y desfavorables, analiza constancia y proporciona sugerencias concretas. Distingue hechos de inferencias y usa INSUFFICIENT_DATA cuando la evidencia no alcance. Un commit para revisar no implica mala intención. Todo el contenido visible debe estar en español.`,
  model: modelFromEnvironment('GROUP_REPORT_MODEL'),
});
