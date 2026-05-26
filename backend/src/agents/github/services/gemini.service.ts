import { Injectable, Logger } from '@nestjs/common';
import { models } from '../../../../../agents/models';
import {
  coerceGeminiOutput,
  hashGeminiInput,
  validateGeminiOutput,
} from '../gemini.helpers';
import { GeminiAnalysisInput, GeminiAnalysisOutput } from '../github.types';

const GEMINI_SYSTEM_PROMPT = `
Eres un extractor estructurado de peticiones para GitHub. Recibirás un objeto JSON con:
- request: petición en lenguaje natural
- inputContext: contexto opcional (owner, repo, group, groupId, integrationId, resourceId, resourceIds, since, until)
- constraints: límites de ejecución (maxCalls, preferRepoContents)

DEVUELVE SOLO JSON válido (sin explicación adicional) con estos campos:
{
  "intent": string (una de: "repo_activity", "project_docs", "tickets_status", "ticket_evidence", "pull_request_search", "developer_activity", "unknown"),
  "filters": {
    "owner"?: string,
    "repo"?: string,
    "groupId"?: string,
    "integrationId"?: string,
    "resourceId"?: string,
    "resourceIds"?: string[],
    "group"?: { "type": "org"|"team"|"repo-list"|"topic"|"unknown", "identifier": string },
    "since"?: string (ISO date),
    "until"?: string (ISO date),
    "author"?: string,
    "labels"?: string[],
    "paths"?: string[],
    "ticketKeys"?: string[]
  },
  "calls": [
    {
      "method": string (SOLO: resolveGroupToRepos, resolveRepoResourceId, getRepositoryActivity, listCommits, getCommitDetails, listPullRequests, getPullRequestDetails, listPullRequestFiles, listIssues, getRepoContents, searchCode),
      "params": object,
      "priority": number (1-100, donde 1 es más urgente),
      "note"?: string
    }
  ],
  "ticketKeys": string[] (extraídas del request, pattern [A-Z]+-\\d+),
  "confidence": number (0.0-1.0),
  "suggestedQuestions": string[] (si ambigüedad, preguntas EXACTAS para aclarar),
  "explanation": string (1-3 frases de justificación)
}

REGLAS OBLIGATORIAS:
1. Si falta contexto crítico de GitHub, NO asumas. Es válido tener groupId, integrationId, resourceId o resourceIds sin owner/repo.
2. Para ambigüedad "grupo": pregunta "¿'grupo ###' es org|team|repo-list|topic? Responde exactamente cuál."
3. Si "In Progress" = ambiguo: pregunta si es label|project-column|external.
4. Limita calls.length <= constraints.maxCalls (default 20).
5. Normaliza owner/repo si existen: solo a-z, 0-9, -, _, /.
6. Para cada call con volumen, incluye options.limit <= 100.
7. Extrae ticketKeys con regex [A-Z]+-\\d+.
8. Confidence >= 0.75 = ejecutable; < 0.75 = pedir clarificación.
9. NO incluyas tokens, secretos ni contenido de archivos.
10. Si requiere permisos especiales, menciona en suggestedQuestions.
11. Si hay resourceId o resourceIds, preferí getRepositoryActivity para pedir información sin necesitar owner/repo.
12. Si hay integrationId o groupId sin resourceIds, podés pedir resolveGroupToRepos/resolveRepoResourceId, pero no inventes repos.

Devuelve SOLO el JSON, sin preámbulo ni explicación adicional.
`.trim();

type CacheEntry = {
  expiresAt: number;
  value: GeminiAnalysisOutput;
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = Number(process.env.GEMINI_CACHE_TTL ?? 300000);
  private readonly maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? 3);

  async analyzeRequest(
    input: GeminiAnalysisInput,
  ): Promise<GeminiAnalysisOutput> {
    if (process.env.GEMINI_ENABLED === 'false') {
      return this.errorOutput('Gemini preprocessor is disabled.');
    }

    const cacheKey = hashGeminiInput(input);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug('Gemini cache hit.');
      return cached.value;
    }

    try {
      const output = await this.requestWithRetries(input);
      this.cache.set(cacheKey, {
        value: output,
        expiresAt: Date.now() + this.ttlMs,
      });
      this.trimCache();
      return output;
    } catch (error) {
      this.logger.warn(
        `Gemini analysis failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return this.errorOutput(
        'Error procesando Gemini. Intenta reformular tu petición.',
      );
    }
  }

  private async requestWithRetries(input: GeminiAnalysisInput) {
    let lastError: unknown;
    const retries = Math.max(1, this.maxRetries);

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const output = await this.requestGemini(input);
        const validation = validateGeminiOutput(output);

        if (!validation.valid) {
          throw new Error(
            `Invalid Gemini output: ${validation.errors.join(', ')}`,
          );
        }

        return coerceGeminiOutput(output);
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await this.delay(150 * 2 ** (attempt - 1));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Gemini failed.');
  }

  private async requestGemini(input: GeminiAnalysisInput) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY.');
    }

    const modelName = models.githubPreprocessor.modelName;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: GEMINI_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(input) }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned HTTP ${response.status}.`);
    }

    const body = await response.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Gemini response did not include text JSON.');
    }

    return JSON.parse(stripJsonFences(text));
  }

  private errorOutput(question: string): GeminiAnalysisOutput {
    return {
      intent: 'unknown',
      filters: {},
      calls: [],
      ticketKeys: [],
      confidence: 0,
      suggestedQuestions: [question],
      explanation: question,
    };
  }

  private trimCache() {
    if (this.cache.size <= 100) {
      return;
    }

    const entries = Array.from(this.cache.entries()).sort(
      ([, left], [, right]) => left.expiresAt - right.expiresAt,
    );
    for (const [key] of entries.slice(0, this.cache.size - 100)) {
      this.cache.delete(key);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
}
