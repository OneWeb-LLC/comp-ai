#!/usr/bin/env bun
import { DEFAULT_CONFIG } from './config';
import { createGitHubClient, requiredChecksGreen } from './github-client';
import { defaultLedgerPath, RunLedger } from './ledger';
import { createLinearClient } from './linear-client';
import { implementationEvidenceComplete } from './pr-detector';
import { buildPullRequestRecord } from './risk-classifier';

interface LifecycleEnv {
  githubToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  eventName: string;
  deterministicCiPassed: boolean;
  linearApiKey?: string;
  runUrl?: string;
}

function readEnv(): LifecycleEnv {
  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch';

  if (!githubToken || !owner || !repoFull || !prNumberRaw) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_NUMBER');
  }

  const [, repo] = repoFull.split('/');
  return {
    githubToken,
    owner,
    repo,
    prNumber: Number(prNumberRaw),
    eventName,
    deterministicCiPassed: process.env.DETERMINISTIC_CI_PASSED === 'true',
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

  ledger.record({
    phase: 'detected',
    repo: record.repo,
    prNumber: record.prNumber,
    headSha: record.headSha,
    linearIssueId: record.linearIssueId,
    riskTier: record.riskTier,
    detail: `Lifecycle controller invoked (${env.eventName})`,
    metadata: {
      isAgentPr: record.isAgentPr,
      isDraft: record.isDraft,
    },
  });

  if (!record.isAgentPr) {
    console.log('Not an agent PR; lifecycle controller exiting.');
    await ledger.save();
    return;
  }

  if (
    record.isDraft &&
    implementationEvidenceComplete({ pr, deterministicCiPassed: env.deterministicCiPassed })
  ) {
    await github.markReadyForReview(env.prNumber);
    ledger.record({
      phase: 'marked_ready',
      repo: record.repo,
      prNumber: record.prNumber,
      headSha: record.headSha,
      linearIssueId: record.linearIssueId,
      riskTier: record.riskTier,
      detail: 'Draft PR marked ready for review after implementation evidence passed',
    });
    console.log(`Marked PR #${env.prNumber} ready for review.`);
    await ledger.save();
    return;
  }

  if (record.isDraft) {
    console.log('Agent PR still draft or implementation evidence incomplete.');
    await ledger.save();
    return;
  }

  if (record.riskTier === 3) {
    await github.createCommitStatus({
      sha: record.headSha,
      context: 'oneweb/founder-approval',
      state: 'pending',
      description: 'Tier 3 change requires explicit founder approval before merge',
      targetUrl: env.runUrl,
    });
    ledger.record({
      phase: 'escalated',
      repo: record.repo,
      prNumber: record.prNumber,
      headSha: record.headSha,
      linearIssueId: record.linearIssueId,
      riskTier: record.riskTier,
      detail: 'Tier 3 PR blocked from auto-merge pending founder approval',
    });
    await ledger.save();
    return;
  }

  const checkRuns = await github.listCheckRunsForRef(record.headSha);
  const statuses = await github.listCombinedStatusForRef(record.headSha);
  const checksReady = requiredChecksGreen({
    requiredChecks: record.requiredChecks,
    checkRuns,
    statuses,
  });

  if (!checksReady) {
    console.log('Required checks not green yet; waiting for audit gate and CI.');
    await ledger.save();
    return;
  }

  if (record.autoMergeEligible) {
    try {
      await github.enableAutoMerge(env.prNumber);
      ledger.record({
        phase: 'auto_merge_armed',
        repo: record.repo,
        prNumber: record.prNumber,
        headSha: record.headSha,
        linearIssueId: record.linearIssueId,
        riskTier: record.riskTier,
        detail: 'GitHub native auto-merge armed after Gate B and deterministic CI passed',
      });
      console.log(`Auto-merge armed for PR #${env.prNumber}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Auto-merge not armed: ${message}`);
    }
  }

  if (env.linearApiKey && record.linearIssueId) {
    const linear = createLinearClient({ apiKey: env.linearApiKey });
    await linear.postAuditPass({
      linearIssueId: record.linearIssueId,
      prUrl: pr.html_url,
      headSha: record.headSha,
    });
  }

  await ledger.save();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
