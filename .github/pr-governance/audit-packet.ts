import type { PullRequestRecord } from './types';

export interface AuditPacket {
  pr: PullRequestRecord;
  prTitle: string;
  prBody: string | null;
  prUrl: string;
  changedFiles: string[];
  diff: string;
}

export function buildAuditPrompt(packet: AuditPacket): string {
  return [
    'You are Gate B, an independent audit agent for One Web autonomous SDLC.',
    'You must NOT assume the implementing agent is trustworthy.',
    'Review the pull request diff and metadata, then emit ONLY valid JSON matching this schema:',
    '{',
    '  "decision": "PASS" | "FAIL" | "CHALLENGE" | "ESCALATE",',
    '  "summary": "string",',
    '  "findings": [{ "severity": "critical|high|medium|low", "title": "string", "detail": "string", "file": "optional string" }]',
    '}',
    '',
    'Policy:',
    '- Tier 1: lightweight audit; PASS when change is low risk and tests/evidence look adequate.',
    '- Tier 2: require meaningful test/evidence coverage and no unresolved security concerns.',
    '- Tier 3: always ESCALATE (founder approval required). Never return PASS for tier 3.',
    '- FAIL/CHALLENGE when remediation is required on the same branch.',
    '- ESCALATE for reserved-risk, ambiguous scope, or policy exceptions.',
    '',
    `PR: #${packet.pr.prNumber} (${packet.prUrl})`,
    `Head SHA: ${packet.pr.headSha}`,
    `Risk tier: ${packet.pr.riskTier}`,
    `Linear issue: ${packet.pr.linearIssueId ?? 'none'}`,
    `Changed files (${packet.changedFiles.length}): ${packet.changedFiles.join(', ')}`,
    '',
    'PR title:',
    packet.prTitle,
    '',
    'PR body:',
    packet.prBody ?? '',
    '',
    'Diff:',
    packet.diff.slice(0, 120_000),
  ].join('\n');
}

export async function fetchPullRequestDiff({
  token,
  owner,
  repo,
  prNumber,
}: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
}): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.diff',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch PR diff (${response.status}): ${text}`);
  }

  return response.text();
}
