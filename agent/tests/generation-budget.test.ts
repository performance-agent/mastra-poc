import assert from 'node:assert/strict';
import test from 'node:test';
import { modelRequest } from '../src/index.js';

const overDefault = 'x'.repeat(50_000);

test('rejects a payload over the model input budget', async () => {
  await assert.rejects(
    modelRequest(
      'custom/report-model',
      'group_report',
      overDefault,
      async () => 'sent',
    ),
    /context_overflow/,
  );
});

test('sends that payload when the caller raises the input ceiling', async () => {
  const result = await modelRequest(
    'custom/report-model',
    'group_report',
    overDefault,
    async () => 'sent',
    { inputBytes: 64_800, maxRetries: 0 },
  );
  assert.equal(result, 'sent');
});
