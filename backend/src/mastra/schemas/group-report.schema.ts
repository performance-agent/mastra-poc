import { z } from 'zod';
import { EVALUATION_EMPHASIS_VALUES } from '../evaluation-guidelines';

const reportStatusSchema = z
  .enum(['GOOD', 'WATCH', 'RISK', 'INSUFFICIENT_DATA'])
  .describe(
    'Resultado basado en evidencia: favorable, a observar, riesgoso o con datos insuficientes.',
  );

const confidenceSchema = z
  .enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'])
  .describe(
    'Confianza según la cantidad, calidad y cobertura de la evidencia.',
  );

const sectionAssessmentSchema = z.object({
  status: reportStatusSchema,
  confidence: confidenceSchema,
  summary: z
    .string()
    .describe('Conclusión neutral basada en la evidencia disponible.'),
  positiveSignals: z
    .array(z.string())
    .describe('Señales favorables observables.'),
  concerns: z
    .array(z.string())
    .describe('Señales desfavorables o contradicciones observables.'),
  limitations: z
    .array(z.string())
    .describe('Restricciones que reducen el alcance o la confianza.'),
});

const dimensionAssessmentSchema = z.object({
  status: reportStatusSchema,
  summary: z.string().describe('Conclusión breve sobre esta dimensión.'),
});

const evidenceSchema = z.object({
  section: z
    .enum(['OVERALL', 'PRODUCT', 'PROJECT', 'ENGINEERING', 'PEOPLE'])
    .describe('Sección principal respaldada por esta evidencia.'),
  subject: z
    .string()
    .nullable()
    .describe(
      'displayName canónico de la identidad reconciliada para PEOPLE, coincidente exactamente con people[].displayName; null para las demás secciones.',
    ),
  type: z.string().describe('Tipo nativo del registro.'),
  resource: z.string().describe('Recurso de origen.'),
  reference: z
    .string()
    .nullable()
    .describe('Identificador verificable si existe.'),
  title: z.string().describe('Título breve y factual.'),
  url: z
    .string()
    .nullable()
    .describe('Enlace original si el proveedor lo ofrece.'),
  observation: z.string().describe('Hecho directamente observable.'),
  interpretation: z
    .string()
    .describe('Inferencia prudente separada del hecho.'),
});

const metricSchema = z.object({
  label: z.string().describe('Nombre neutral de una métrica disponible.'),
  value: z.string().describe('Valor observado expresado para visualización.'),
});

const projectStageSchema = z.object({
  label: z.string().describe('Nombre descriptivo de la etapa.'),
  period: z.string().describe('Período respaldado por las fechas disponibles.'),
  summary: z.string().describe('Evolución del foco durante la etapa.'),
  status: reportStatusSchema,
});

const commitReviewSchema = z.object({
  resource: z.string(),
  reference: z.string().nullable().describe('SHA o referencia disponible.'),
  message: z.string().describe('Mensaje tal como aparece en los datos.'),
  author: z
    .string()
    .nullable()
    .describe('Autor observable si está disponible.'),
  url: z.string().nullable(),
  status: z.enum(['WATCH', 'RISK']),
  confidence: confidenceSchema,
  signals: z
    .array(z.string())
    .describe('Patrones observables que justifican la revisión.'),
  explanation: z
    .string()
    .describe('Explicación neutral, sin atribuir intención o mala conducta.'),
  recommendedAction: z
    .string()
    .describe('Acción concreta de revisión o trazabilidad.'),
});

const consistencySchema = z.object({
  level: z.enum(['CONSISTENT', 'VARIABLE', 'SPORADIC', 'INSUFFICIENT_DATA']),
  confidence: confidenceSchema,
  summary: z
    .string()
    .describe(
      'Regularidad dentro del período observable, sin comparar personas.',
    ),
  limitations: z.array(z.string()),
});

export const groupReportContentSchema = z.object({
  summary: z
    .string()
    .describe(
      'Síntesis holística del producto, proyecto, ingeniería y personas.',
    ),

  overallAssessment: sectionAssessmentSchema.extend({
    score: z
      .number()
      .min(0)
      .max(100)
      .nullable()
      .describe(
        '80-100 GOOD, 50-79 WATCH, 0-49 RISK; null para INSUFFICIENT_DATA.',
      ),
  }),

  productAssessment: z.object({
    ticketEvidenceAvailable: z
      .boolean()
      .describe(
        'Indica si existen tickets o elementos equivalentes utilizables.',
      ),
    assessment: sectionAssessmentSchema,
    ideation: dimensionAssessmentSchema.describe(
      'Necesidades, hipótesis y evolución inferibles desde tickets.',
    ),
    prioritiesAndScope: dimensionAssessmentSchema.describe(
      'Prioridades, jerarquías y cambios de alcance observables.',
    ),
    ticketFlow: dimensionAssessmentSchema.describe(
      'Creación, avance, acumulación y cierre de tickets.',
    ),
    themes: z.array(
      z.object({
        name: z.string(),
        evolution: z
          .string()
          .describe('Evolución durante el historial disponible.'),
      }),
    ),
    gaps: z
      .array(z.string())
      .describe('Vacíos observables de producto o ideación.'),
  }),

  projectAssessment: z.object({
    assessment: sectionAssessmentSchema,
    deliveryFlow: dimensionAssessmentSchema,
    continuity: dimensionAssessmentSchema,
    predictability: dimensionAssessmentSchema,
    projectStages: z.array(projectStageSchema),
    risks: z.array(z.string()),
    lessons: z.array(z.string()),
  }),

  engineeringAssessment: z.object({
    assessment: sectionAssessmentSchema,
    traceability: dimensionAssessmentSchema,
    changeDiscipline: dimensionAssessmentSchema,
    reviewability: dimensionAssessmentSchema,
    maintenanceSignals: dimensionAssessmentSchema,
    commitsToReview: z.array(commitReviewSchema),
  }),

  people: z.array(
    z.object({
      displayName: z
        .string()
        .describe(
          'Nombre canónico, completo y legible elegido tras reconciliar los alias respaldados por la evidencia entre proveedores.',
        ),
      assessment: sectionAssessmentSchema,
      contributionSummary: z
        .string()
        .describe('Contribución observable y su contexto.'),
      metrics: z.array(metricSchema),
      consistency: consistencySchema,
      improvementAreas: z
        .array(z.string())
        .describe('Mejoras respaldadas por evidencia.'),
      suggestions: z
        .array(z.string())
        .describe('Sugerencias concretas y accionables.'),
    }),
  ),

  evidence: z
    .array(evidenceSchema)
    .describe('Evidencia central que separa hechos de interpretaciones.'),

  recommendations: z.array(
    z.object({
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      title: z.string(),
      description: z.string(),
      action: z.string(),
    }),
  ),
});

const coverageSchema = z.object({
  resourcesAnalyzed: z.number().int().nonnegative(),
  datasetsAnalyzed: z.number().int().nonnegative(),
  recordsAnalyzed: z.number().int().nonnegative(),
  firstActivityAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  limitations: z.array(z.string()),
});

const evaluationGuidelinesSnapshotSchema = z.object({
  emphasis: z.array(z.enum(EVALUATION_EMPHASIS_VALUES)),
  notes: z.string().nullable(),
});

export const groupReportSchema = groupReportContentSchema.extend({
  coverage: coverageSchema,
  evaluationGuidelines: evaluationGuidelinesSnapshotSchema.nullable(),
});

export type GroupReportContent = z.infer<typeof groupReportContentSchema>;
export type GroupReport = z.infer<typeof groupReportSchema>;
