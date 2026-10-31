import {
  EvaluatorEffort,
  EvaluatorPersonality,
  GroupEvaluationEmphasis,
} from '../../generated/prisma/enums';

export const AVATAR_COUNT = 50;

export function defaultWorkspaceEvaluators(workspaceId: string) {
  return [
    {
      id: `strict_${workspaceId}`,
      name: 'Strict',
      description:
        'Looks closely at engineering discipline and calls out gaps.',
      scope: 'WORKSPACE' as const,
      effort: EvaluatorEffort.HIGH,
      personality: EvaluatorPersonality.demanding,
      avatar: 0,
      evaluationEmphasis: [GroupEvaluationEmphasis.ENGINEERING],
      workspaceId,
      rules: {
        create: [
          {
            name: 'Reviewed changes',
            description:
              'Los cambios importantes tienen que mostrar revisión y un propósito claro.',
            valuation: 9,
            position: 0,
          },
        ],
      },
    },
    {
      id: `gentle_${workspaceId}`,
      name: 'Gentle',
      description: 'Pays attention to people and keeps the tone supportive.',
      scope: 'WORKSPACE' as const,
      effort: EvaluatorEffort.LOW,
      personality: EvaluatorPersonality.careful,
      avatar: 5,
      evaluationEmphasis: [GroupEvaluationEmphasis.PEOPLE],
      workspaceId,
      rules: {
        create: [
          {
            name: 'Room to improve',
            description:
              'Señalá lo que funciona antes de marcar un hueco, y dejá el próximo paso concreto.',
            valuation: 6,
            position: 0,
          },
        ],
      },
    },
    {
      id: `technical_${workspaceId}`,
      name: 'Technical',
      description: 'Focuses on how the code and the reviews actually look.',
      scope: 'WORKSPACE' as const,
      effort: EvaluatorEffort.MEDIUM,
      personality: EvaluatorPersonality.direct,
      avatar: 4,
      evaluationEmphasis: [GroupEvaluationEmphasis.ENGINEERING],
      workspaceId,
      rules: {
        create: [
          {
            name: 'Traceable engineering',
            description:
              'Preferí evidencia de cambios, revisiones y mantenimiento antes que el volumen de actividad.',
            valuation: 8,
            position: 0,
          },
        ],
      },
    },
  ];
}
