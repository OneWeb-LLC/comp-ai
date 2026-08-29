import type { AuditFinding, AuditResult } from './types';

interface LinearClientOptions {
  apiKey: string;
}

interface LinearIssueResponse {
  data?: {
    issue?: {
      id: string;
      identifier: string;
      url: string;
    };
  };
}

export function createLinearClient({ apiKey }: LinearClientOptions) {
  async function linearRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Linear API failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }

  return {
    async getIssueByIdentifier(identifier: string): Promise<{ id: string; url: string } | null> {
      const searchResponse = await linearRequest<{
        data?: {
          issues?: {
            nodes: Array<{ id: string; identifier: string; url: string }>;
          };
        };
      }>(
        `
          query IssuesByIdentifier($filter: IssueFilter!) {
            issues(filter: $filter, first: 1) {
              nodes {
                id
                identifier
                url
              }
            }
          }
        `,
        {
          filter: {
            identifier: { eq: identifier },
          },
        },
      );

      const issue = searchResponse.data?.issues?.nodes[0];
      if (!issue) {
        return null;
      }

      return { id: issue.id, url: issue.url };
    },

    async createComment({
      issueId,
      body,
    }: {
      issueId: string;
      body: string;
    }): Promise<void> {
      await linearRequest(
        `
          mutation CreateComment($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
              success
            }
          }
        `,
        { issueId, body },
      );
    },

    async postAuditFailure({
      linearIssueId,
      prUrl,
      headSha,
      audit,
    }: {
      linearIssueId: string;
      prUrl: string;
      headSha: string;
      audit: AuditResult;
    }): Promise<void> {
      const issue = await this.getIssueByIdentifier(linearIssueId);
      if (!issue) {
        return;
      }

      const findings = audit.findings
        .map(
          (finding: AuditFinding) =>
            `- **${finding.severity.toUpperCase()}** ${finding.title}${finding.file ? ` (\`${finding.file}\`)` : ''}: ${finding.detail}`,
        )
        .join('\n');

      const body = [
        '## Gate B audit failed',
        '',
        `PR: ${prUrl}`,
        `Head SHA: \`${headSha}\``,
        `Decision: **${audit.decision}**`,
        '',
        audit.summary,
        '',
        findings || '_No structured findings returned._',
        '',
        'Remediation has been requested on the same branch. Gate B will rerun after the next push.',
      ].join('\n');

      await this.createComment({ issueId: issue.id, body });
    },

    async postAuditPass({
      linearIssueId,
      prUrl,
      headSha,
    }: {
      linearIssueId: string;
      prUrl: string;
      headSha: string;
    }): Promise<void> {
      const issue = await this.getIssueByIdentifier(linearIssueId);
      if (!issue) {
        return;
      }

      await this.createComment({
        issueId: issue.id,
        body: [
          '## Gate B audit passed',
          '',
          `PR: ${prUrl}`,
          `Head SHA: \`${headSha}\``,
          'Auto-merge has been armed; GitHub branch protections decide final merge eligibility.',
        ].join('\n'),
      });
    },

    async postEscalation({
      linearIssueId,
      prUrl,
      headSha,
      reason,
    }: {
      linearIssueId: string;
      prUrl: string;
      headSha: string;
      reason: string;
    }): Promise<void> {
      const issue = await this.getIssueByIdentifier(linearIssueId);
      if (!issue) {
        return;
      }

      await this.createComment({
        issueId: issue.id,
        body: [
          '## Gate B escalation — founder approval required',
          '',
          `PR: ${prUrl}`,
          `Head SHA: \`${headSha}\``,
          '',
          reason,
        ].join('\n'),
      });
    },
  };
}

export type LinearClient = ReturnType<typeof createLinearClient>;
