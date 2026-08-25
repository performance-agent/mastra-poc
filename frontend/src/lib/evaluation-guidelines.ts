export const EVALUATION_EMPHASIS_VALUES = [
  'PRODUCT',
  'DELIVERY',
  'ENGINEERING',
  'PEOPLE',
  'GITHUB_EVIDENCE',
  'TICKET_EVIDENCE',
] as const;

export type EvaluationEmphasis = (typeof EVALUATION_EMPHASIS_VALUES)[number];

export const MAX_EMPHASIS_COUNT = 3;
export const MAX_NOTES_LENGTH = 2000;

export const CONFLICTING_EVIDENCE_PAIR: [EvaluationEmphasis, EvaluationEmphasis] = [
  'GITHUB_EVIDENCE',
  'TICKET_EVIDENCE',
];

export const EMPHASIS_LABELS: Record<EvaluationEmphasis, string> = {
  PRODUCT: 'Product & ideation',
  DELIVERY: 'Delivery & predictability',
  ENGINEERING: 'Code quality & discipline',
  PEOPLE: 'Team continuity',
  GITHUB_EVIDENCE: 'Weight GitHub over tickets',
  TICKET_EVIDENCE: 'Weight tickets over GitHub',
};

export const EMPHASIS_DESCRIPTIONS: Record<EvaluationEmphasis, string> = {
  PRODUCT: 'Prioritize product analysis, themes, and ticket-driven scope evolution.',
  DELIVERY: 'Prioritize delivery flow, sprint continuity, and predictability signals.',
  ENGINEERING: 'Prioritize PR discipline, code review coverage, and maintenance signals.',
  PEOPLE: 'Prioritize individual continuity, consistency, and contribution patterns.',
  GITHUB_EVIDENCE: 'When GitHub and ticket data conflict, lean on GitHub for technical signals.',
  TICKET_EVIDENCE: 'When GitHub and ticket data conflict, lean on tickets for scope and delivery signals.',
};
