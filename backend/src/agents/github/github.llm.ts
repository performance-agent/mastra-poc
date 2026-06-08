import { HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GithubAgentState, GithubRequestUnderstanding } from './github.types';
import { buildFallbackUnderstanding } from './github.prompts';
import {
  getMessageText,
  getNullableString,
  parseJsonResponse,
} from './github.utils';

export async function callGeminiJson(prompt: string): Promise<unknown> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_FAST_MODEL ?? 'gemini-1.5-flash',
    maxOutputTokens: 2048,
    temperature: 0,
  });

  const response = await model.invoke([new HumanMessage(prompt)]);
  return parseJsonResponse(getMessageText(response.content));
}

export function parseUnderstandingResponse(
  value: unknown,
): GithubRequestUnderstanding {
  const rawUnderstanding = value as Partial<GithubRequestUnderstanding>;
  const fallback = buildFallbackUnderstanding('');

  return {
    intent: isKnownIntent(rawUnderstanding.intent)
      ? rawUnderstanding.intent
      : fallback.intent,
    ticketKey: getNullableString(rawUnderstanding.ticketKey),
    developer: getNullableString(rawUnderstanding.developer),
    branch: getNullableString(rawUnderstanding.branch),
    moduleOrPath: getNullableString(rawUnderstanding.moduleOrPath),
    repository: getNullableString(rawUnderstanding.repository),
    requiredEvidence: Array.isArray(rawUnderstanding.requiredEvidence)
      ? rawUnderstanding.requiredEvidence.filter(
          (evidence) => typeof evidence === 'string',
        )
      : [],
  };
}

function isKnownIntent(
  value: unknown,
): value is GithubRequestUnderstanding['intent'] {
  return (
    typeof value === 'string' &&
    [
      'ticket_evidence',
      'developer_activity',
      'team_activity',
      'pull_request_status',
      'repository_summary',
      'module_activity',
      'unknown',
    ].includes(value)
  );
}

export type GithubGeminiMetrics = GithubAgentState['metrics'];
