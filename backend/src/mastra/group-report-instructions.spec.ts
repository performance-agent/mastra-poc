import {
  GROUP_REPORT_GENERATION_PROMPT,
  GROUP_REPORT_INSTRUCTIONS,
} from './group-report-instructions';
import { groupReportContentSchema } from './schemas/group-report.schema';

describe('Group Report identity reconciliation contract', () => {
  it('allows prudent cross-provider alias reconciliation and preserves ambiguity', () => {
    expect(GROUP_REPORT_INSTRUCTIONS).toContain(
      'reconcilia las identidades observadas en todos los proveedores',
    );
    expect(GROUP_REPORT_INSTRUCTIONS).toContain(
      '"p.garcia" y "Pedro Garcia" pueden consolidarse',
    );
    expect(GROUP_REPORT_INSTRUCTIONS).toContain(
      '"alex" y "Alex Smith" deben permanecer separados',
    );
    expect(GROUP_REPORT_INSTRUCTIONS).toContain(
      'explica la incertidumbre como una limitación',
    );
    expect(GROUP_REPORT_GENERATION_PROMPT).toContain(
      'conserva separadas las identidades ambiguas',
    );
  });

  it('requires one canonical display name for people and their evidence', () => {
    expect(GROUP_REPORT_INSTRUCTIONS).toContain(
      'Agrupa bajo esa persona las contribuciones y métricas de todos sus alias',
    );
    expect(GROUP_REPORT_GENERATION_PROMPT).toContain(
      'usa ese mismo nombre en evidence.subject',
    );

    const personSchema = groupReportContentSchema.shape.people.element;
    const evidenceSchema = groupReportContentSchema.shape.evidence.element;

    expect(personSchema.shape.displayName.description).toContain(
      'Nombre canónico, completo y legible',
    );
    expect(evidenceSchema.shape.subject.description).toContain(
      'coincidente exactamente con people[].displayName',
    );
  });
});
