import type { GovernanceConfig, RiskTier } from './types';

export const DEFAULT_CONFIG: GovernanceConfig = {
  auditCheckContext: 'oneweb/audit-gate',
  agentBranchPrefixes: ['cursor/', 'codex/', 'COMP-', 'ONE-'],
  agentLabels: ['automated-pr', 'cursor-agent', 'oneweb-agent'],
  wipLabels: ['oneweb:wip', 'agent-wip'],
  holdLabels: ['oneweb:tier-3-hold', 'oneweb:no-auto-merge'],
  maxAuditRetries: 3,
  tier1RequiredChecks: ['PR Governance / Deterministic CI', 'oneweb/audit-gate'],
  tier2RequiredChecks: [
    'PR Governance / Deterministic CI',
    'Security Review',
    'oneweb/audit-gate',
  ],
  tier3RequiredChecks: [
    'PR Governance / Deterministic CI',
    'Security Review',
    'oneweb/audit-gate',
    'oneweb/founder-approval',
  ],
};

export const TIER3_PATH_PATTERNS: RegExp[] = [
  /packages\/db\/prisma\/migrations\//,
  /packages\/auth\/src\/permissions\.ts$/,
  /apps\/api\/src\/auth\//,
  /apps\/api\/src\/billing\//,
  /apps\/api\/src\/.*credentials/,
  /\.env(\.|$)/,
  /deploy\.sh$/,
  /Dockerfile$/,
  /docker-compose\.yml$/,
];

export const TIER2_PATH_PATTERNS: RegExp[] = [
  /^apps\//,
  /^packages\//,
  /^\.github\/workflows\//,
  /^scripts\//,
];

export function requiredChecksForTier({
  tier,
  config = DEFAULT_CONFIG,
}: {
  tier: RiskTier;
  config?: GovernanceConfig;
}): string[] {
  if (tier === 1) {
    return config.tier1RequiredChecks;
  }
  if (tier === 2) {
    return config.tier2RequiredChecks;
  }
  return config.tier3RequiredChecks;
}
