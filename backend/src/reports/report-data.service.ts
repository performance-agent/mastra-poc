import { Injectable } from '@nestjs/common';
import type {
  GithubCommitActivity,
  GithubIssueActivity,
  GithubPullRequestActivity,
  GithubRepositoryActivity,
} from '../integrations/github/types/github.types';
import { PluginDataQueryService } from '../plugin-runtime/plugin-data-query.service';
import {
  software,
  type SoftwareCommit,
  type SoftwareIssue,
  type SoftwarePullRequest,
} from '@pa/packs-software';
import type { DataRecord } from '@pa/core';

type GithubRepositoryResourceForReport = {
  id: string;
  name: string;
  githubRepository?: {
    fullName?: string | null;
    defaultBranch?: string | null;
    htmlUrl?: string | null;
    isPrivate?: boolean | null;
  } | null;
};

@Injectable()
export class ReportDataService {
  constructor(
    private readonly pluginDataQueryService: PluginDataQueryService,
  ) {}

  async getGithubActivityForResources(
    resources: readonly GithubRepositoryResourceForReport[],
  ): Promise<GithubRepositoryActivity[]> {
    return Promise.all(
      resources.map((resource) => this.getCanonicalGithubActivity(resource)),
    );
  }

  private async getCanonicalGithubActivity(
    resource: GithubRepositoryResourceForReport,
  ): Promise<GithubRepositoryActivity> {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [
      openPullRequests,
      recentlyClosedPullRequests,
      openIssues,
      recentlyClosedIssues,
      recentCommits,
    ] = await Promise.all([
      this.pluginDataQueryService.queryGitHubResource(
        resource.id,
        software.pullRequest.v1,
        {
          where: { status: ['open'] },
        },
      ),
      this.pluginDataQueryService.queryGitHubResource(
        resource.id,
        software.pullRequest.v1,
        {
          where: { status: ['closed', 'merged'] },
        },
      ),
      this.pluginDataQueryService.queryGitHubResource(
        resource.id,
        software.issue.v1,
        {
          where: { status: ['open'] },
        },
      ),
      this.pluginDataQueryService.queryGitHubResource(
        resource.id,
        software.issue.v1,
        {
          where: { status: ['closed'], updatedSince: since },
        },
      ),
      this.pluginDataQueryService.queryGitHubResource(
        resource.id,
        software.commit.v1,
        {
          where: { since },
        },
      ),
    ]);

    const recentlyClosed = recentlyClosedPullRequests.map((record) =>
      this.mapPullRequest(record),
    );

    return {
      resourceId: resource.id,
      repository: {
        name: resource.name,
        fullName: resource.githubRepository?.fullName ?? resource.name,
        defaultBranch: resource.githubRepository?.defaultBranch ?? null,
        htmlUrl: resource.githubRepository?.htmlUrl ?? null,
        isPrivate: resource.githubRepository?.isPrivate ?? null,
      },
      pullRequests: {
        open: openPullRequests.map((record) => this.mapPullRequest(record)),
        recentlyClosed: recentlyClosed,
        recentlyMerged: recentlyClosed.filter((pr) => pr.state === 'MERGED'),
      },
      issues: {
        open: openIssues.map((record) => this.mapIssue(record)),
        recentlyClosed: recentlyClosedIssues.map((record) =>
          this.mapIssue(record),
        ),
      },
      commits: recentCommits.map((record) => this.mapCommit(record)),
    };
  }

  private mapPullRequest(
    record: DataRecord<SoftwarePullRequest>,
  ): GithubPullRequestActivity {
    const pr = record.data;
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author ?? null,
      state:
        pr.status === 'merged'
          ? 'MERGED'
          : pr.status === 'open' || pr.status === 'draft'
            ? 'OPEN'
            : 'CLOSED',
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
      closedAt: pr.closedAt?.toISOString() ?? null,
      mergedAt: pr.mergedAt?.toISOString() ?? null,
      draft: pr.status === 'draft',
      // TODO: Extend canonical pull request contracts with review/comment/file stats.
      comments: 0,
      reviewComments: 0,
      additions: null,
      deletions: null,
      changedFiles: null,
      url: pr.source.url ?? '',
    };
  }

  private mapIssue(record: DataRecord<SoftwareIssue>): GithubIssueActivity {
    const issue = record.data;
    return {
      number: Number(issue.source.externalId),
      title: issue.title,
      author: issue.assignees[0] ?? null,
      state: issue.status === 'closed' ? 'CLOSED' : 'OPEN',
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      closedAt:
        issue.status === 'closed' ? issue.updatedAt.toISOString() : null,
      labels: [...issue.labels],
      // TODO: Extend canonical issue contracts with comment counts and explicit author.
      comments: 0,
      url: issue.source.url ?? '',
    };
  }

  private mapCommit(record: DataRecord<SoftwareCommit>): GithubCommitActivity {
    const commit = record.data;
    return {
      sha: commit.sha,
      message: commit.message,
      authorName: commit.author?.name ?? null,
      authorEmail: commit.author?.email ?? null,
      githubLogin: commit.author?.login ?? null,
      date:
        commit.authoredAt?.toISOString() ??
        commit.committedAt?.toISOString() ??
        null,
      url: commit.source.url ?? '',
    };
  }
}
