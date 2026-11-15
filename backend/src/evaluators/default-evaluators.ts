import {
  EvaluatorEffort,
  GroupEvaluationEmphasis,
} from '../../generated/prisma/enums';

export const AVATAR_COUNT = 50;

export const DEFAULT_VOICES = [
  {
    name: 'Demanding',
    position: 0,
    instruction:
      'Nombrá primero lo que está confirmado. Si hay un problema vigente, decilo sin suavizarlo. Si falta información, indicá la incertidumbre. Si no hay evidencia de algo que haya que frenar, decilo explícitamente.',
  },
  {
    name: 'Direct',
    position: 1,
    instruction:
      'Decí lo que pasó, de forma directa, sin suavizar ni empujar.',
  },
  {
    name: 'Careful',
    position: 2,
    instruction:
      'Nombrá lo que funciona y dejá un solo próximo paso concreto. El tono es cuidadoso.',
  },
] as const;

export function defaultWorkspaceEvaluators(
  workspaceId: string,
  voices: Array<{ id: string; name: string }>,
) {
  const personalityId = (name: string) => {
    const voice = voices.find((item) => item.name === name);
    if (!voice) throw new Error(`Missing default personality ${name}`);
    return voice.id;
  };
  return [
    {
      id: `strict_${workspaceId}`,
      name: 'Strict',
      description:
        'Looks closely at engineering discipline and calls out gaps.',
      scope: 'WORKSPACE' as const,
      effort: EvaluatorEffort.HIGH,
      personalityId: personalityId('Demanding'),
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
      personalityId: personalityId('Careful'),
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
      personalityId: personalityId('Direct'),
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
