#!/usr/bin/env bun
import { DEFAULT_CONFIG } from './config';
import {
  auditDecisionToStatus,
  normalizeAuditResult,
  parseAuditDecisionText,
  resolveMockAuditDecision,
  runClaudeAudit,
} from './audit-decision';
import { buildAuditPrompt, fetchPullRequestDiff } from './audit-packet';
import { createGitHubClient } from './github-client';
import { defaultLedgerPath, RunLedger } from './ledger';
import { createLinearClient } from './linear-client';
import { buildPullRequestRecord } from './risk-classifier';

interface AuditGateEnv {
  githubToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  anthropicApiKey?: string;
  auditMock: boolean;
  linearApiKey?: string;
  runUrl?: string;
}

function readEnv(): AuditGateEnv {
  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const auditMock = process.env.GOVERNANCE_AUDIT_MOCK === '1' || !anthropicApiKey;

  if (!githubToken || !owner || !repoFull || !prNumberRaw) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_NUMBER');
  }

  const [, repo] = repoFull.split('/');
  return {
    githubToken,
    owner,
    repo,
    prNumber: Number(prNumberRaw),
    anthropicApiKey,
    auditMock,
    linearApiKey: process.env.LINEAR_API_KEY,
    runUrl: process.env.GITHUB_RUN_URL,
  };
}

async function main(): Promise<void> {
  const env = readEnv();
  const github = createGitHubClient({
    token: env.githubToken,
    owner: env.owner,
    repo: env.repo,
  });
  const ledger = new RunLedger(defaultLedgerPath(`${env.owner}/${env.repo}`, env.prNumber));
  await ledger.load();

  const pr = await github.getPullRequest(env.prNumber);
  const changedFiles = await github.listPullRequestFiles(env.prNumber);
  const record = buildPullRequestRecord({
    repo: `${env.owner}/${env.repo}`,
    pr,
    changedFiles,
  });

  if (!record.auditRequired || record.isDraft) {
    console.log('Audit not required or PR still draft; skipping Gate B.');
    await ledger.save();
    return;
  }

  ledger.record({
    phase: 'audit_pending',
    repo: record.repo,
    prNumber: record.prNumber,
    headSha: record.headSha,
    linearIssueId: record.linearIssueId,
    riskTier: record.riskTier,
    detail: 'Independent Gate B audit started',
  });

  await github.createCommitStatus({
    sha: record.headSha,
    context: DEFAULT_CONFIG.auditCheckContext,
    state: 'pending',
    description: 'Gate B independent audit in progress',
    targetUrl: env.runUrl,
  });

  const diff = await fetchPullRequestDiff({
    token: env.githubToken,
    owner: env.owner,
    repo: env.repo,
    prNumber: env.prNumber,
  });

  const prompt = buildAuditPrompt({
    pr: record,
    prTitle: pr.title,
    prBody: pr.body,
    prUrl: pr.html_url,
    changedFiles,
    diff,
  });

  const retryCount = ledger.getRetryCount(env.prNumber, record.headSha);
  const prLabels = pr.labels.map((label) => label.name);
  const mockDecision = resolveMockAuditDecision({
    prLabels,
    retryCount,
    mockEnabled: env.auditMock,
  });
  const rawText = await runClaudeAudit({
    apiKey: env.anthropicApiKey ?? 'mock',
    prompt,
    mockDecision,
  });
  const audit = normalizeAuditResult({
    raw: parseAuditDecisionText(rawText),
    headSha: record.headSha,
    riskTier: record.riskTier,
    retryCount,
  });

  const statusState = auditDecisionToStatus(audit.decision);
  await github.createCommitStatus({
    sha: record.headSha,
    context: DEFAULT_CONFIG.auditCheckContext,
    state: statusState === 'pending' ? 'pending' : statusState,
    description: `${audit.decision}: ${audit.summary}`.slice(0, 140),
    targetUrl: env.runUrl,
  });

  if (audit.decision === 'PASS') {
    ledger.record({
      phase: 'audit_pass',
      repo: record.repo,
      prNumber: record.prNumber,
      headSha: record.headSha,
      linearIssueId: record.linearIssueId,
      riskTier: record.riskTier,
      detail: audit.summary,
    });
  } else if (audit.decision === 'ESCALATE' || record.riskTier === 3) {
    await github.disableAutoMerge(env.prNumber).catch(() => undefined);
    ledger.record({
      phase: 'escalated',
      repo: record.repo,
      prNumber: record.prNumber,
      headSha: record.headSha,
      linearIssueId: record.linearIssueId,
      riskTier: record.riskTier,
      detail: audit.summary,
    });
    if (env.linearApiKey && record.linearIssueId) {
      const linear = createLinearClient({ apiKey: env.linearApiKey });
      await linear.postEscalation({
        linearIssueId: record.linearIssueId,
        prUrl: pr.html_url,
        headSha: record.headSha,
        reason: audit.summary,
      });
    }
  } else {
    await github.disableAutoMerge(env.prNumber).catch(() => undefined);
    ledger.record({
      phase: 'audit_fail',
      repo: record.repo,
      prNumber: record.prNumber,
      headSha: record.headSha,
      linearIssueId: record.linearIssueId,
      riskTier: record.riskTier,
      detail: audit.summary,
      metadata: { findings: audit.findings.length },
    });

    await github.createIssueComment(
      env.prNumber,
      [
        '## Gate B audit requires remediation',
        '',
        `Decision: **${audit.decision}**`,
        '',
        audit.summary,
        '',
        ...audit.findings.map(
          (finding) =>
            `- **${finding.severity.toUpperCase()}** ${finding.title}${finding.file ? ` (\`${finding.file}\`)` : ''}: ${finding.detail}`,
        ),
        '',
        'Push fixes to this branch to invalidate the prior audit SHA and rerun Gate B.',
      ].join('\n'),
    );

    if (env.linearApiKey && record.linearIssueId) {
      const linear = createLinearClient({ apiKey: env.linearApiKey });
      await linear.postAuditFailure({
        linearIssueId: record.linearIssueId,
        prUrl: pr.html_url,
        headSha: record.headSha,
        audit,
      });
    }

    if (retryCount + 1 >= DEFAULT_CONFIG.maxAuditRetries) {
      console.log('Retry budget exhausted; leaving PR blocked.');
      process.exitCode = 1;
    } else {
      ledger.record({
        phase: 'remediation_dispatched',
        repo: record.repo,
        prNumber: record.prNumber,
        headSha: record.headSha,
        linearIssueId: record.linearIssueId,
        riskTier: record.riskTier,
        detail: 'Structured findings posted; remediation requested on same branch',
      });
    }
  }

  await ledger.save();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
