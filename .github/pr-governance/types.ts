export type RiskTier = 1 | 2 | 3;

export type AuditDecision = 'PASS' | 'FAIL' | 'CHALLENGE' | 'ESCALATE';

export type LifecyclePhase =
  | 'detected'
  | 'implementation_complete'
  | 'marked_ready'
  | 'audit_pending'
  | 'audit_pass'
  | 'audit_fail'
  | 'auto_merge_armed'
  | 'merged'
  | 'post_merge_verified'
  | 'escalated'
  | 'remediation_dispatched';

export interface PullRequestRecord {
  repo: string;
  prNumber: number;
  headSha: string;
  baseRef: string;
  headRef: string;
  isDraft: boolean;
  isAgentPr: boolean;
  linearIssueId: string | null;
  riskTier: RiskTier;
  requiredChecks: string[];
  auditRequired: boolean;
  autoMergeEligible: boolean;
}

export interface AuditFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  file?: string;
}

export interface AuditResult {
  decision: AuditDecision;
  headSha: string;
  riskTier: RiskTier;
  summary: string;
  findings: AuditFinding[];
  retryCount: number;
  auditedAt: string;
}

export interface LedgerEntry {
  timestamp: string;
  phase: LifecyclePhase;
  repo: string;
  prNumber: number;
  headSha: string;
  linearIssueId: string | null;
  riskTier: RiskTier;
  detail: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GovernanceConfig {
  auditCheckContext: string;
  agentBranchPrefixes: string[];
  agentLabels: string[];
  wipLabels: string[];
  holdLabels: string[];
  maxAuditRetries: number;
  tier1RequiredChecks: string[];
  tier2RequiredChecks: string[];
  tier3RequiredChecks: string[];
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  labels: Array<{ name: string }>;
  user: { login: string };
  mergeable_state: string;
  html_url: string;
}

export interface GitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}
