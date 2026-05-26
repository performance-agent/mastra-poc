import {
  GithubAllowedPlanMethod,
  GithubChangedFile,
  GithubEvidenceKind,
  GithubNormalizedCommit,
  GithubNormalizedPullRequest,
  GithubPlanResult,
  GithubRequestUnderstanding,
} from './github.types';

const TICKET_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const NOISE_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^coverage\//,
  /^\.next\//,
  /^\.turbo\//,
  /^logs\//,
  /\.log$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)generated\//,
];

export function hasCriticalMissingInformation(missingInformation: string[]) {
  return missingInformation.some(
    (item) => item === 'request' || item.startsWith('githubContext:'),
  );
}

export function detectIntent(
  lowerRequest: string,
  ticketKey: string | null,
  developer: string | null,
  moduleOrPath: string | null,
) {
  if (ticketKey) {
    return 'ticket_evidence';
  }
  if (developer) {
    return 'developer_activity';
  }
  if (lowerRequest.includes('pr') || lowerRequest.includes('pull request')) {
    return 'pull_request_status';
  }
  if (moduleOrPath) {
    return 'module_activity';
  }
  if (lowerRequest.includes('equipo') || lowerRequest.includes('sprint')) {
    return 'team_activity';
  }
  if (lowerRequest.includes('repo') || lowerRequest.includes('repositorio')) {
    return 'repository_summary';
  }
  return 'unknown';
}

export function detectRequiredEvidence(intent: string): GithubEvidenceKind[] {
  switch (intent) {
    case 'ticket_evidence':
      return ['commits', 'pull_requests', 'merge_status', 'changed_files'];
    case 'developer_activity':
      return ['commits', 'pull_requests', 'changed_files', 'ticket_references'];
    case 'pull_request_status':
      return ['pull_requests', 'merge_status', 'ticket_references'];
    case 'module_activity':
      return ['commits', 'pull_requests', 'changed_files'];
    default:
      return ['commits', 'pull_requests', 'ticket_references'];
  }
}

export function extractDeveloper(request: string) {
  const match =
    request.match(
      /\b(?:de|del|por|autor(?:a)?|developer)\s+@?([a-zA-Z0-9-]+)\b/i,
    ) ?? request.match(/\b@([a-zA-Z0-9-]+)\b/);

  return match?.[1] ?? null;
}

export function extractBranch(request: string) {
  const match = request.match(/\b(?:branch|rama)\s+([a-zA-Z0-9._/-]+)\b/i);
  return match?.[1] ?? null;
}

export function extractModuleOrPath(request: string) {
  const pathMatch = request.match(
    /\b(?:modulo|módulo|path|directorio|carpeta|archivo)\s+(?:de\s+)?([a-zA-Z0-9._/-]+)\b/i,
  );
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  if (
    request.toLowerCase().includes('autenticacion') ||
    request.toLowerCase().includes('autenticación')
  ) {
    return 'auth';
  }

  return null;
}

export function extractTicketReferences(text: string | null | undefined) {
  if (!text) {
    return [];
  }

  return uniqueStrings(text.match(TICKET_PATTERN) ?? []);
}

export function cleanArgs(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  );
}

export function selectRefsFromPreviousResults(
  args: Record<string, unknown>,
  results: GithubPlanResult[],
  key: 'sha' | 'number',
) {
  const fromStep = String(args.fromStep);
  const matchTicketKey = args.matchTicketKey
    ? String(args.matchTicketKey)
    : null;
  const matchPath = args.matchPath ? String(args.matchPath) : null;
  const limit = Number(args.limit ?? 10);
  const previousData = results.find(
    (result) => result.step.id === fromStep,
  )?.data;
  const items = Array.isArray(previousData) ? previousData : [];

  return items
    .filter((item) => {
      if (matchTicketKey && !objectContainsText(item, matchTicketKey)) {
        return false;
      }
      if (matchPath && !objectContainsText(item, matchPath)) {
        return false;
      }
      return Boolean(item?.[key]);
    })
    .slice(0, limit)
    .map((item) => item[key]);
}

export function normalizeCommits(
  results: GithubPlanResult[],
  focusedTicketKey: string | null,
) {
  const commits = flattenResultData(results, [
    'listCommits',
    'getCommitDetails',
  ]);
  const bySha = new Map<string, any>();

  for (const commit of commits) {
    if (!commit?.sha) {
      continue;
    }

    bySha.set(commit.sha, {
      ...(bySha.get(commit.sha) ?? {}),
      ...commit,
      files: commit.files ?? bySha.get(commit.sha)?.files,
    });
  }

  return Array.from(bySha.values())
    .filter((commit) =>
      focusedTicketKey ? objectContainsText(commit, focusedTicketKey) : true,
    )
    .map<GithubNormalizedCommit>((commit) => ({
      sha: commit.sha,
      message: commit.message ?? '',
      authorName: commit.authorName ?? null,
      authorEmail: commit.authorEmail ?? null,
      githubLogin: commit.githubLogin ?? null,
      date: commit.date ?? null,
      url: commit.url ?? '',
      ticketReferences: extractTicketReferences(commit.message),
      files: Array.isArray(commit.files) ? commit.files : undefined,
    }));
}

export function normalizePullRequests(
  results: GithubPlanResult[],
  focusedTicketKey: string | null,
) {
  const pullRequests = flattenResultData(results, [
    'listPullRequests',
    'getPullRequestDetails',
  ]);
  const byNumber = new Map<number, any>();

  for (const pullRequest of pullRequests) {
    if (!pullRequest?.number) {
      continue;
    }

    byNumber.set(pullRequest.number, {
      ...(byNumber.get(pullRequest.number) ?? {}),
      ...pullRequest,
      files: pullRequest.files ?? byNumber.get(pullRequest.number)?.files,
    });
  }

  return Array.from(byNumber.values())
    .filter((pullRequest) =>
      focusedTicketKey
        ? objectContainsText(pullRequest, focusedTicketKey)
        : true,
    )
    .map<GithubNormalizedPullRequest>((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title ?? '',
      body: pullRequest.body ?? null,
      author: pullRequest.author ?? null,
      state: pullRequest.state ?? 'CLOSED',
      createdAt: pullRequest.createdAt ?? '',
      updatedAt: pullRequest.updatedAt ?? '',
      closedAt: pullRequest.closedAt ?? null,
      mergedAt: pullRequest.mergedAt ?? null,
      draft: pullRequest.draft ?? false,
      comments: pullRequest.comments ?? 0,
      reviewComments: pullRequest.reviewComments ?? 0,
      additions: pullRequest.additions ?? null,
      deletions: pullRequest.deletions ?? null,
      changedFiles: pullRequest.changedFiles ?? null,
      url: pullRequest.url ?? '',
      headRef: pullRequest.headRef ?? null,
      baseRef: pullRequest.baseRef ?? null,
      mergeCommitSha: pullRequest.mergeCommitSha ?? null,
      ticketReferences: extractTicketReferences(
        `${pullRequest.title ?? ''}\n${pullRequest.body ?? ''}\n${pullRequest.headRef ?? ''}`,
      ),
      files: Array.isArray(pullRequest.files) ? pullRequest.files : undefined,
    }));
}

export function uniqueFiles(files: GithubChangedFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.filename}:${file.status}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function isNoiseFile(filename: string) {
  return NOISE_PATTERNS.some((pattern) => pattern.test(filename));
}

export function buildObservations(
  commits: GithubNormalizedCommit[],
  pullRequests: GithubNormalizedPullRequest[],
  relevantFiles: string[],
) {
  const observations: string[] = [];

  if (commits.length) {
    observations.push(`Found ${commits.length} related commit(s).`);
  }

  if (pullRequests.length) {
    observations.push(`Found ${pullRequests.length} related pull request(s).`);
  }

  if (relevantFiles.length) {
    observations.push(
      `Found ${relevantFiles.length} relevant changed file(s).`,
    );
  }

  return observations;
}

export function buildPossibleInconsistencies(
  understanding: GithubRequestUnderstanding,
  commits: GithubNormalizedCommit[],
  pullRequests: GithubNormalizedPullRequest[],
  ignoredFiles: string[],
  filesChanged: GithubChangedFile[],
) {
  const inconsistencies: string[] = [];
  const hasMergedPullRequest = pullRequests.some((pr) => pr.mergedAt);

  if (
    understanding.intent === 'ticket_evidence' &&
    !commits.length &&
    !pullRequests.length
  ) {
    inconsistencies.push(
      'Ticket has no associated commits or pull requests in GitHub evidence.',
    );
  }

  if (commits.length && !hasMergedPullRequest) {
    inconsistencies.push(
      'Related commits were found, but no merged pull request was found.',
    );
  }

  for (const pullRequest of pullRequests) {
    if (pullRequest.state === 'CLOSED' && !pullRequest.mergedAt) {
      inconsistencies.push(
        `Pull request #${pullRequest.number} is closed without merge evidence.`,
      );
    }

    if (pullRequest.state === 'OPEN' && daysSince(pullRequest.createdAt) >= 7) {
      inconsistencies.push(
        `Pull request #${pullRequest.number} has been open for several days.`,
      );
    }

    if (!pullRequest.ticketReferences.length) {
      inconsistencies.push(
        `Pull request #${pullRequest.number} has no ticket reference.`,
      );
    }
  }

  if (commits.some((commit) => !commit.ticketReferences.length)) {
    inconsistencies.push('Some related commits have no ticket reference.');
  }

  if (filesChanged.length && ignoredFiles.length / filesChanged.length > 0.5) {
    inconsistencies.push(
      'A large share of changed files looks like technical noise.',
    );
  }

  if (commits.length === 1 && filesChanged.length >= 20) {
    inconsistencies.push(
      'A single commit changes many files and may be difficult to audit.',
    );
  }

  return uniqueStrings(inconsistencies);
}

export function calculateConfidence(
  hasMergedPullRequest: boolean,
  hasRelatedCommits: boolean,
  hasRelatedPullRequests: boolean,
  hasErrors: boolean,
) {
  if (!hasErrors && hasMergedPullRequest) {
    return 'high';
  }

  if (hasRelatedCommits || hasRelatedPullRequests) {
    return 'medium';
  }

  return 'low';
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function flattenResultData(
  results: GithubPlanResult[],
  methods: GithubAllowedPlanMethod[],
) {
  return results
    .flatMap((result) => {
      if (methods.includes(result.step.method)) {
        return Array.isArray(result.data) ? result.data : [result.data];
      }

      if (result.step.method !== 'github_dynamic_calls') {
        return [];
      }

      const dynamicResults = Array.isArray(result.data) ? result.data : [];
      return dynamicResults
        .filter((dynamicResult) =>
          methods.includes(dynamicResult?.method as GithubAllowedPlanMethod),
        )
        .flatMap((dynamicResult) =>
          Array.isArray(dynamicResult?.data)
            ? dynamicResult.data
            : [dynamicResult?.data],
        );
    })
    .filter(Boolean) as any[];
}

function objectContainsText(value: unknown, text: string) {
  return JSON.stringify(value ?? {})
    .toLowerCase()
    .includes(text.toLowerCase());
}

function daysSince(dateLike: string) {
  const timestamp = new Date(dateLike).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}
