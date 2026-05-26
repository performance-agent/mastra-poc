import { runGithubAgent } from './github.agent';

describe('GithubAgent', () => {
  it('builds ticket evidence using only the provided GithubService methods', async () => {
    const githubService = {
      listCommits: jest.fn().mockResolvedValue([
        {
          sha: 'abc',
          message: 'LAB-12 add auth flow',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          githubLogin: 'xoaquin',
          date: '2026-05-10T00:00:00.000Z',
          url: 'https://github.com/acme/repo/commit/abc',
        },
      ]),
      listPullRequests: jest.fn().mockResolvedValue([
        {
          number: 7,
          title: 'LAB-12 add auth flow',
          body: 'Implements LAB-12',
          author: 'xoaquin',
          state: 'MERGED',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-11T00:00:00.000Z',
          closedAt: '2026-05-11T00:00:00.000Z',
          mergedAt: '2026-05-11T00:00:00.000Z',
          draft: false,
          comments: 1,
          reviewComments: 0,
          additions: 10,
          deletions: 2,
          changedFiles: 1,
          url: 'https://github.com/acme/repo/pull/7',
          headRef: 'feature/LAB-12-auth',
          baseRef: 'main',
          mergeCommitSha: 'merge-sha',
        },
      ]),
      getCommitDetails: jest.fn().mockResolvedValue({
        sha: 'abc',
        message: 'LAB-12 add auth flow',
        authorName: 'Dev',
        authorEmail: 'dev@example.com',
        githubLogin: 'xoaquin',
        date: '2026-05-10T00:00:00.000Z',
        url: 'https://github.com/acme/repo/commit/abc',
        files: [
          {
            filename: 'src/auth/login.ts',
            status: 'modified',
            additions: 10,
            deletions: 2,
            changes: 12,
          },
        ],
      }),
      getPullRequestDetails: jest.fn().mockResolvedValue({
        number: 7,
        title: 'LAB-12 add auth flow',
        body: 'Implements LAB-12',
        author: 'xoaquin',
        state: 'MERGED',
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
        closedAt: '2026-05-11T00:00:00.000Z',
        mergedAt: '2026-05-11T00:00:00.000Z',
        draft: false,
        comments: 1,
        reviewComments: 0,
        additions: 10,
        deletions: 2,
        changedFiles: 1,
        url: 'https://github.com/acme/repo/pull/7',
        headRef: 'feature/LAB-12-auth',
        baseRef: 'main',
        mergeCommitSha: 'merge-sha',
        files: [
          {
            filename: 'src/auth/login.ts',
            status: 'modified',
            additions: 10,
            deletions: 2,
            changes: 12,
          },
        ],
      }),
      listPullRequestFiles: jest.fn(),
    };

    const output = await runGithubAgent(
      {
        request:
          'Necesito saber si el ticket LAB-12 fue realmente implementado y mergeado.',
        owner: 'acme',
        repo: 'repo',
        since: '2026-05-01',
        until: '2026-05-19',
      },
      githubService as any,
    );

    expect(output.status).toBe('success');
    expect(output.intent).toBe('ticket_evidence');
    expect(output.detectedEntities.ticketKey).toBe('LAB-12');
    expect(output.evidence).toMatchObject({
      hasRelatedCommits: true,
      hasRelatedPullRequests: true,
      hasMergedPullRequest: true,
      hasRelevantCodeChanges: true,
      integrationEvidence: true,
    });
    expect(output.confidence).toBe('high');
    expect(githubService.listCommits).toHaveBeenCalled();
    expect(githubService.listPullRequests).toHaveBeenCalled();
    expect(githubService.getCommitDetails).toHaveBeenCalled();
    expect(githubService.getPullRequestDetails).toHaveBeenCalled();
  });
});
