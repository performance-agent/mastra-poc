import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEvaluationDto } from './create-evaluation.dto';
import { EvaluationViewDto } from './evaluation-view.dto';

describe('evaluation DTOs', () => {
  it('accepts a valid rule batch and calendar-date period', async () => {
    const dto = plainToInstance(CreateEvaluationDto, {
      rules: [{
        name: 'Delivery traceability',
        description: 'Delivered work should be visible in repository activity.',
        valuation: 8,
      }],
      period: { from: '2026-08-01', to: '2026-08-10' },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects empty rules, invalid valuation, and non-calendar date formats', async () => {
    const dto = plainToInstance(CreateEvaluationDto, {
      rules: [{ name: ' ', valuation: 11 }],
      period: { from: '08/01/2026', to: '2026-08-10T00:00:00Z' },
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['rules', 'period']),
    );
  });

  it('rejects unsupported response views', async () => {
    const query = plainToInstance(EvaluationViewDto, { view: 'raw' });
    const errors = await validate(query);
    expect(errors[0]?.property).toBe('view');
  });
});
