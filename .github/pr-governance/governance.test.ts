import { describe, expect, it } from 'bun:test';
import { requiredChecksForTier } from './config';
import {
  auditDecisionToStatus,
  normalizeAuditResult,
  parseAuditDecisionText,
  resolveMockAuditDecision,
} from './audit-decision';
import {
  extractLinearIssueId,
  implementationEvidenceComplete,
  isAgentBranch,
  isAgentPullRequest,
} from './pr-detector';
import { buildPullRequestRecord, classifyRiskTier } from './risk-classifier';
import type { GitHubPullRequest } from './types';

function makePr(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 1,
    title: 'test',
    body: 'Linear Issue: [ONE-70](https://linear.app/one-web/issue/ONE-70/test)',
    draft: false,
    head: { ref: 'cursor/test-branch', sha: 'abc123' },
    base: { ref: 'main' },
    labels: [{ name: 'automated-pr' }],
    user: { login: 'cursor-agent' },
    mergeable_state: 'clean',
    html_url: 'https://github.com/OneWeb-LLC/comp-ai/pull/1',
    ...overrides,
  };
}

describe('pr-detector', () => {
  it('extracts Linear issue ids from PR bodies', () => {
    expect(extractLinearIssueId('Fixes ONE-10')).toBe('ONE-10');
    expect(extractLinearIssueId('https://linear.app/one-web/issue/COMP-42/foo')).toBe('COMP-42');
  });

  it('detects agent branches and PRs', () => {
    expect(isAgentBranch({ headRef: 'cursor/fix-docker' })).toBe(true);
    expect(isAgentPullRequest({ pr: makePr() })).toBe(true);
    expect(isAgentPullRequest({ pr: makePr({ head: { ref: 'feature/foo', sha: 'x' } }) })).toBe(
      true,
    );
  });

  it('requires deterministic CI and linear link before marking ready', () => {
    expect(
      implementationEvidenceComplete({
        pr: makePr({ draft: true }),
        deterministicCiPassed: true,
      }),
    ).toBe(true);
    expect(
      implementationEvidenceComplete({
        pr: makePr({ draft: true, body: 'no linear link' }),
        deterministicCiPassed: true,
      }),
    ).toBe(false);
  });
});

describe('risk-classifier', () => {
  it('classifies tier 3 for auth and migration paths', () => {
    expect(classifyRiskTier(['packages/db/prisma/migrations/20260101_init/migration.sql'])).toBe(
      3,
    );
    expect(classifyRiskTier(['apps/api/src/auth/session.service.ts'])).toBe(3);
  });

  it('classifies tier 2 for application code', () => {
    expect(classifyRiskTier(['apps/app/src/page.tsx'])).toBe(2);
    expect(classifyRiskTier(['Dockerfile'])).toBe(3);
  });

  it('builds PR records with audit and auto-merge eligibility', () => {
    const record = buildPullRequestRecord({
      repo: 'OneWeb-LLC/comp-ai',
      pr: makePr(),
      changedFiles: ['apps/app/src/page.tsx'],
    });
    expect(record.riskTier).toBe(2);
    expect(record.auditRequired).toBe(true);
    expect(record.autoMergeEligible).toBe(true);
    expect(record.linearIssueId).toBe('ONE-70');
  });
});

describe('audit-decision', () => {
  it('parses fenced JSON audit responses', () => {
    const raw = parseAuditDecisionText('```json\n{"decision":"PASS","summary":"ok","findings":[]}\n```');
    expect(raw.decision).toBe('PASS');
  });

  it('forces ESCALATE for tier 3 regardless of model output', () => {
    const audit = normalizeAuditResult({
      raw: { decision: 'PASS', summary: 'looks fine', findings: [] },
      headSha: 'sha',
      riskTier: 3,
      retryCount: 0,
    });
    expect(audit.decision).toBe('ESCALATE');
    expect(auditDecisionToStatus(audit.decision)).toBe('pending');
  });

  it('injects one recoverable audit failure when label present', () => {
    expect(
      resolveMockAuditDecision({
        prLabels: ['oneweb:inject-audit-fail'],
        retryCount: 0,
        mockEnabled: true,
      }),
    ).toBe('FAIL');
    expect(
      resolveMockAuditDecision({
        prLabels: ['oneweb:inject-audit-fail'],
        retryCount: 1,
        mockEnabled: true,
      }),
    ).toBe('PASS');
  });
});

describe('config', () => {
  it('includes oneweb/audit-gate in required checks', () => {
    expect(requiredChecksForTier({ tier: 2 })).toContain('oneweb/audit-gate');
  });
});
