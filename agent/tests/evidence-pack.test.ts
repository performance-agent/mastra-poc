import assert from 'node:assert/strict';
import test from 'node:test';
import { packEvidence } from '../src/index.js';

function pullRequest(number: number, extra: Record<string, unknown> = {}) {
  return {
    number,
    repository: 'org/repo',
    state: 'open',
    additions: 1,
    createdAt: `2026-01-${String(number).padStart(2, '0')}T00:00:00.000Z`,
    ...extra,
  };
}

function selectedNumbers(evidence: unknown) {
  const projected = evidence as {
    records: { sample: Array<{ number: number }> };
  };
  return projected.records.sample.map((item) => item.number);
}

test('shortens a long comment without removing the other records', () => {
  const records = [1, 2, 3, 4, 5].map((number) =>
    pullRequest(number, {
      issueComments:
        number === 3
          ? [
              {
                author: 'ana',
                body: 'x'.repeat(4000),
                createdAt: '2026-01-03T00:00:00.000Z',
              },
            ]
          : [],
    }),
  );
  const roomy = packEvidence({ records }, 5, {
    budgetBytes: 5_000_000,
    prefix: '',
  });
  const tight = packEvidence({ records }, 5, {
    budgetBytes: roomy.receipt.bytes - 1,
    prefix: '',
  });
  const sample = (
    tight.evidence as {
      records: {
        sample: Array<{
          number: number;
          issueComments: { sample: Array<{ body: string }> };
        }>;
      };
    }
  ).records.sample;

  assert.deepEqual(
    sample.map((item) => item.number),
    [1, 2, 3, 4, 5],
  );
  assert.ok(sample[2]?.issueComments.sample[0]?.body.length ?? 0 < 500);
  assert.equal(
    tight.receipt.operations.some((operation) => operation.action === 'shorten_text'),
    true,
  );
  assert.equal(
    tight.receipt.operations.some((operation) => operation.action === 'drop_records'),
    false,
  );
  assert.equal(tight.receipt.counts[0]?.final, tight.receipt.counts[0]?.initial);
});

test('keeps the first, middle and last record when records must be removed', () => {
  const records = Array.from({ length: 10 }, (_, index) =>
    pullRequest(index + 1, { title: 'T'.repeat(2500) }),
  );
  const packed = packEvidence({ records }, 10, {
    budgetBytes: 9000,
    prefix: '',
  });
  const numbers = selectedNumbers(packed.evidence);
  const projected = packed.evidence as {
    aggregates: { pullRequests: { total: number } };
  };

  assert.ok(numbers.length >= 2);
  assert.ok(numbers.length < 10);
  assert.equal(numbers[0], 1);
  assert.equal(numbers.at(-1), 10);
  assert.ok((numbers[1] ?? 0) > 2);
  assert.equal(projected.aggregates.pullRequests.total, 10);
  assert.equal(
    packed.receipt.operations.some((operation) => operation.action === 'drop_records'),
    true,
  );
});

test('keeps at least one nested comment and records how many were omitted', () => {
  const records = [
    pullRequest(1, {
      issueComments: Array.from({ length: 6 }, (_, index) => ({
        author: 'ana',
        body: `comment ${index} ${'y'.repeat(180)}`,
        createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      })),
    }),
  ];
  const roomy = packEvidence({ records }, 8, {
    budgetBytes: 5_000_000,
    prefix: '',
  });
  const tight = packEvidence({ records }, 8, {
    budgetBytes: Math.floor(roomy.receipt.bytes / 4),
    prefix: '',
  });

  assert.equal(roomy.receipt.nested.comments.kept, 6);
  assert.equal(tight.receipt.counts[0]?.final, 1);
  assert.ok(tight.receipt.nested.comments.kept >= 1);
  assert.ok(tight.receipt.nested.comments.kept < 6);
  assert.equal(
    tight.receipt.nested.comments.kept + tight.receipt.nested.comments.omitted,
    6,
  );
  assert.equal(
    tight.receipt.operations.some((operation) => operation.action === 'reduce_list'),
    true,
  );
});

test('high keeps more records than medium and medium more than low when the minimum package fits', () => {
  const records = Array.from({ length: 40 }, (_, index) =>
    pullRequest(index + 1),
  );
  const input = {
    resources: [
      {
        datasets: [{ dataType: 'github.pullRequest', records }],
      },
    ],
  };
  const low = packEvidence(input, 9, { budgetBytes: 48000, prefix: '' });
  const medium = packEvidence(input, 15, { budgetBytes: 48000, prefix: '' });
  const high = packEvidence(input, 30, { budgetBytes: 64800, prefix: '' });
  const final = (packed: typeof low) =>
    packed.receipt.counts.find((count) => count.type === 'github.pullRequest')
      ?.final ?? 0;

  assert.equal(final(low), 9);
  assert.equal(final(medium), 15);
  assert.equal(final(high), 30);
  assert.ok(final(high) > final(medium));
  assert.ok(final(medium) > final(low));
  assert.deepEqual(low.receipt.operations, []);
});

test('a full read keeps every record and every comment when the package fits', () => {
  const records = Array.from({ length: 40 }, (_, index) =>
    pullRequest(index + 1, {
      issueComments: Array.from({ length: 10 }, (__, comment) => ({
        author: 'ana',
        body: `comment ${comment}`,
        createdAt: `2026-04-${String(comment + 1).padStart(2, '0')}T00:00:00.000Z`,
      })),
    }),
  );
  const packed = packEvidence(
    {
      resources: [
        { datasets: [{ dataType: 'github.pullRequest', records }] },
      ],
    },
    1000,
    { budgetBytes: 2_000_000, prefix: '', textCap: 8000, listCap: 1000 },
  );
  const count = packed.receipt.counts.find(
    (item) => item.type === 'github.pullRequest',
  );

  assert.equal(count?.stored, 40);
  assert.equal(count?.final, 40);
  assert.equal(packed.receipt.nested.comments.kept, 400);
  assert.equal(packed.receipt.nested.comments.omitted, 0);
  assert.deepEqual(packed.receipt.operations, []);
});

test('links a parent and a mentioned ticket, and labels records without a verifiable link', () => {
  const packed = packEvidence(
    {
      records: [
        { key: 'KAN-170', status: 'Por hacer', summary: 'padre' },
        {
          key: 'KAN-178',
          status: 'Listo',
          parentKey: 'KAN-170',
          summary: 'subtarea',
        },
        pullRequest(82, { title: 'KAN-178 sedes', state: 'merged' }),
        { sha: 'abc123', message: 'unrelated change', author: 'marcos' },
        pullRequest(9, { title: 'KAN-999 missing' }),
      ],
    },
    12,
    { budgetBytes: 200_000, prefix: '' },
  );
  const sample = (
    packed.evidence as {
      records: { sample: Array<Record<string, unknown>> };
    }
  ).records.sample;
  const byId = new Map(
    sample.map((item) => [
      typeof item.key === 'string'
        ? item.key
        : typeof item.sha === 'string'
          ? item.sha
          : String(item.number),
      item.links,
    ]),
  );

  assert.deepEqual(byId.get('KAN-178'), ['parent:KAN-170']);
  assert.deepEqual(byId.get('82'), ['ticket:KAN-178']);
  assert.deepEqual(byId.get('abc123'), ['sin vínculo identificado']);
  assert.deepEqual(byId.get('9'), ['sin vínculo identificado']);
  assert.equal(sample.length, 5);
});
