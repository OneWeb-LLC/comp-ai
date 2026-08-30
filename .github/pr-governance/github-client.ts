import type { GitHubCheckRun, GitHubPullRequest } from './types';

interface GitHubClientOptions {
  token: string;
  owner: string;
  repo: string;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubRequest<T>({
  token,
  url,
  method = 'GET',
  body,
}: {
  token: string;
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
}): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      ...githubHeaders(token),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${url} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const messages = payload.errors.map((entry) => entry.message).join('; ');
    throw new Error(`GitHub GraphQL error: ${messages}`);
  }

  return payload as T;
}

export function createGitHubClient({ token, owner, repo }: GitHubClientOptions) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  return {
    async getPullRequest(prNumber: number): Promise<GitHubPullRequest> {
      return githubRequest<GitHubPullRequest>({
        token,
        url: `${base}/pulls/${prNumber}`,
      });
    },

    async listPullRequestFiles(prNumber: number): Promise<string[]> {
      const files = await githubRequest<Array<{ filename: string }>>({
        token,
        url: `${base}/pulls/${prNumber}/files?per_page=100`,
      });
      return files.map((file) => file.filename);
    },

    async markReadyForReview(prNumber: number): Promise<void> {
      const nodeId = await this.getPullRequestNodeId(prNumber);
      await githubRequest({
        token,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        body: {
          query: `
            mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
              markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
                pullRequest { isDraft }
              }
            }
          `,
          variables: { pullRequestId: nodeId },
        },
      });
    },

    async enableAutoMerge(prNumber: number): Promise<void> {
      await githubRequest({
        token,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        body: {
          query: `
            mutation EnableAutoMerge($pullRequestId: ID!) {
              enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: SQUASH }) {
                pullRequest { autoMergeEnabled }
              }
            }
          `,
          variables: {
            pullRequestId: await this.getPullRequestNodeId(prNumber),
          },
        },
      });
    },

    async getPullRequestNodeId(prNumber: number): Promise<string> {
      const response = await githubRequest<{ node_id: string }>({
        token,
        url: `${base}/pulls/${prNumber}`,
      });
      return response.node_id;
    },

    async createCommitStatus({
      sha,
      context,
      state,
      description,
      targetUrl,
    }: {
      sha: string;
      context: string;
      state: 'pending' | 'success' | 'failure' | 'error';
      description: string;
      targetUrl?: string;
    }): Promise<void> {
      await githubRequest({
        token,
        url: `${base}/statuses/${sha}`,
        method: 'POST',
        body: {
          state,
          context,
          description: description.slice(0, 140),
          target_url: targetUrl,
        },
      });
    },

    async listCheckRunsForRef(ref: string): Promise<GitHubCheckRun[]> {
      const response = await githubRequest<{ check_runs: GitHubCheckRun[] }>({
        token,
        url: `${base}/commits/${ref}/check-runs?per_page=100`,
      });
      return response.check_runs;
    },

    async listCombinedStatusForRef(ref: string): Promise<Array<{ context: string; state: string }>> {
      const response = await githubRequest<{
        statuses: Array<{ context: string; state: string }>;
      }>({
        token,
        url: `${base}/commits/${ref}/status`,
      });
      return response.statuses;
    },

    async createIssueComment(prNumber: number, body: string): Promise<void> {
      await githubRequest({
        token,
        url: `${base}/issues/${prNumber}/comments`,
        method: 'POST',
        body: { body },
      });
    },

    async listOpenPullRequests(): Promise<GitHubPullRequest[]> {
      return githubRequest<GitHubPullRequest[]>({
        token,
        url: `${base}/pulls?state=open&per_page=100`,
      });
    },

    async disableAutoMerge(prNumber: number): Promise<void> {
      await githubRequest({
        token,
        url: 'https://api.github.com/graphql',
        method: 'POST',
        body: {
          query: `
            mutation DisableAutoMerge($pullRequestId: ID!) {
              disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
                pullRequest { autoMergeEnabled }
              }
            }
          `,
          variables: {
            pullRequestId: await this.getPullRequestNodeId(prNumber),
          },
        },
      });
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

export function requiredChecksGreen({
  requiredChecks,
  checkRuns,
  statuses,
}: {
  requiredChecks: string[];
  checkRuns: GitHubCheckRun[];
  statuses: Array<{ context: string; state: string }>;
}): boolean {
  return requiredChecks.every((required) => {
    const checkRun = checkRuns.find((run) => run.name === required);
    if (checkRun) {
      return checkRun.status === 'completed' && checkRun.conclusion === 'success';
    }
    const status = statuses.find((entry) => entry.context === required);
    if (status) {
      return status.state === 'success';
    }
    return false;
  });
}
