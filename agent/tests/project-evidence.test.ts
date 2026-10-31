import assert from 'node:assert/strict';
import test from 'node:test';
import { projectEvidence } from '../src/index.js';

test('spreads dated records across the period instead of keeping the oldest rows', () => {
  const records = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => ({
    number: index + 1,
    state: 'open',
    additions: 1,
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const projected = projectEvidence(
    { records: records.slice().reverse() },
    3,
  ) as {
    records: { total: number; omitted: number; sample: Array<{ number: number }> };
    aggregates: { pullRequests: { total: number; open: number } };
  };

  assert.deepEqual(
    projected.records.sample.map((item) => item.number),
    [1, 6, 10],
  );
  assert.equal(projected.records.total, 10);
  assert.equal(projected.records.omitted, 7);
  assert.equal(projected.aggregates.pullRequests.total, 10);
  assert.equal(projected.aggregates.pullRequests.open, 10);
});

test('counts merges, approvals and reviews from the full stored history', () => {
  const projected = projectEvidence(
    {
      records: [
        {
          number: 1,
          state: 'closed',
          additions: 100,
          mergedAt: '2026-08-03T00:00:00.000Z',
          author: 'martin',
          createdAt: '2026-08-01T00:00:00.000Z',
          reviews: [
            {
              author: 'pedro',
              state: 'APPROVED',
              submittedAt: '2026-08-02T00:00:00.000Z',
            },
          ],
        },
        {
          number: 2,
          state: 'merged',
          additions: 10,
          author: 'guadalupe',
          createdAt: '2026-09-01T00:00:00.000Z',
          reviews: [],
        },
        {
          number: 3,
          state: 'closed',
          additions: 4,
          author: 'martin',
          createdAt: '2026-10-01T00:00:00.000Z',
          reviews: [{ author: 'pedro', state: 'COMMENTED', body: 'nit' }],
        },
      ],
    },
    1,
  ) as {
    aggregates: {
      pullRequests: {
        merged: number;
        closedUnmerged: number;
        mergedWithApprovalBeforeMerge: number;
        mergedWithoutApproval: number;
        byAuthor: Record<string, number>;
        reviewsByAuthor: Record<string, number>;
      };
    };
  };

  assert.deepEqual(projected.aggregates.pullRequests, {
    total: 3,
    merged: 2,
    closedUnmerged: 1,
    open: 0,
    mergedWithApprovalBeforeMerge: 1,
    mergedWithoutApproval: 1,
    byAuthor: { martin: 2, guadalupe: 1 },
    reviewsByAuthor: { pedro: 2 },
  });
});

test('reports an open parent whose children are already done', () => {
  const projected = projectEvidence(
    {
      records: [
        { key: 'KAN-60', status: 'Por hacer', statusCategory: 'Por hacer' },
        {
          key: 'KAN-135',
          status: 'Listo',
          statusCategory: 'Listo',
          parentKey: 'KAN-60',
          resolvedAt: '2026-10-13T00:00:00.000Z',
        },
      ],
    },
    12,
  ) as {
    aggregates: {
      tickets: {
        done: number;
        notDone: number;
        parentsOpenWithDoneChildren: Array<{ parent: string; doneChildren: number }>;
      };
    };
  };

  assert.equal(projected.aggregates.tickets.done, 1);
  assert.equal(projected.aggregates.tickets.notDone, 1);
  assert.deepEqual(projected.aggregates.tickets.parentsOpenWithDoneChildren, [
    {
      parent: 'KAN-60',
      parentStatus: 'Por hacer',
      doneChildren: 1,
      childCount: 1,
    },
  ]);
});
