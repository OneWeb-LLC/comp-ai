import {
  DEFAULT_CONFIG,
  TIER2_PATH_PATTERNS,
  TIER3_PATH_PATTERNS,
  requiredChecksForTier,
} from './config';
import type { GitHubPullRequest, PullRequestRecord, RiskTier } from './types';
import { extractLinearIssueId, hasHoldLabel, isAgentPullRequest } from './pr-detector';

export function classifyRiskTier(changedFiles: string[]): RiskTier {
  if (changedFiles.some((file) => TIER3_PATH_PATTERNS.some((pattern) => pattern.test(file)))) {
    return 3;
  }
  if (changedFiles.some((file) => TIER2_PATH_PATTERNS.some((pattern) => pattern.test(file)))) {
    return 2;
  }
  return 1;
}

export function buildPullRequestRecord({
  repo,
  pr,
  changedFiles,
  config = DEFAULT_CONFIG,
}: {
  repo: string;
  pr: GitHubPullRequest;
  changedFiles: string[];
  config?: typeof DEFAULT_CONFIG;
}): PullRequestRecord {
  const riskTier = classifyRiskTier(changedFiles);
  const isAgentPr = isAgentPullRequest({ pr, config });
  const auditRequired = isAgentPr && riskTier <= 2;
  const autoMergeEligible =
    isAgentPr && riskTier <= 2 && !hasHoldLabel({ pr, config }) && !pr.draft;

  return {
    repo,
    prNumber: pr.number,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    isDraft: pr.draft,
    isAgentPr,
    linearIssueId: extractLinearIssueId(pr.body),
    riskTier,
    requiredChecks: requiredChecksForTier({ tier: riskTier, config }),
    auditRequired,
    autoMergeEligible,
  };
}
