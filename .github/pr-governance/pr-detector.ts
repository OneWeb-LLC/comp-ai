import { DEFAULT_CONFIG } from './config';
import type { GitHubPullRequest } from './types';

const LINEAR_ISSUE_PATTERN =
  /(?:linear\.app\/[^/\s]+\/issue\/|(?:Fixes|Closes|Resolves)\s+)(ONE|COMP)-(\d+)/i;

export function extractLinearIssueId(body: string | null): string | null {
  if (!body) {
    return null;
  }
  const match = body.match(LINEAR_ISSUE_PATTERN);
  if (!match) {
    return null;
  }
  return `${match[1].toUpperCase()}-${match[2]}`;
}

export function isAgentBranch({
  headRef,
  prefixes = DEFAULT_CONFIG.agentBranchPrefixes,
}: {
  headRef: string;
  prefixes?: string[];
}): boolean {
  return prefixes.some((prefix) => headRef.startsWith(prefix));
}

export function isAgentPullRequest({
  pr,
  config = DEFAULT_CONFIG,
}: {
  pr: GitHubPullRequest;
  config?: typeof DEFAULT_CONFIG;
}): boolean {
  const labelNames = pr.labels.map((label) => label.name);
  const hasAgentLabel = config.agentLabels.some((label) => labelNames.includes(label));
  const hasCursorFooter = Boolean(pr.body?.includes('cursor.com/agents/'));
  return (
    isAgentBranch({ headRef: pr.head.ref, prefixes: config.agentBranchPrefixes }) ||
    hasAgentLabel ||
    hasCursorFooter
  );
}

export function hasWipLabel({
  pr,
  config = DEFAULT_CONFIG,
}: {
  pr: GitHubPullRequest;
  config?: typeof DEFAULT_CONFIG;
}): boolean {
  const labelNames = pr.labels.map((label) => label.name);
  return config.wipLabels.some((label) => labelNames.includes(label));
}

export function hasHoldLabel({
  pr,
  config = DEFAULT_CONFIG,
}: {
  pr: GitHubPullRequest;
  config?: typeof DEFAULT_CONFIG;
}): boolean {
  const labelNames = pr.labels.map((label) => label.name);
  return config.holdLabels.some((label) => labelNames.includes(label));
}

export function implementationEvidenceComplete({
  pr,
  deterministicCiPassed,
}: {
  pr: GitHubPullRequest;
  deterministicCiPassed: boolean;
}): boolean {
  if (!isAgentPullRequest({ pr })) {
    return false;
  }
  if (hasWipLabel({ pr })) {
    return false;
  }
  if (!extractLinearIssueId(pr.body)) {
    return false;
  }
  return deterministicCiPassed;
}
