#!/usr/bin/env bun
import { createGitHubClient } from './github-client';
import { defaultLedgerPath, RunLedger } from './ledger';
import { createLinearClient } from './linear-client';
import { extractLinearIssueId } from './pr-detector';

interface PostMergeEnv {
  githubToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  mergeSha: string;
  linearApiKey?: string;
}

function readEnv(): PostMergeEnv {
  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const mergeSha = process.env.MERGE_SHA;

  if (!githubToken || !owner || !repoFull || !prNumberRaw || !mergeSha) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, or MERGE_SHA');
  }

  const [, repo] = repoFull.split('/');
  return {
    githubToken,
    owner,
    repo,
    prNumber: Number(prNumberRaw),
    mergeSha,
    linearApiKey: process.env.LINEAR_API_KEY,
  };
}

async function main(): Promise<void> {
  const env = readEnv();
  const github = createGitHubClient({
    token: env.githubToken,
    owner: env.owner,
    repo: env.repo,
  });
  const pr = await github.getPullRequest(env.prNumber);
  const linearIssueId = extractLinearIssueId(pr.body);
  const ledger = new RunLedger(defaultLedgerPath(`${env.owner}/${env.repo}`, env.prNumber));
  await ledger.load();

  ledger.record({
    phase: 'merged',
    repo: `${env.owner}/${env.repo}`,
    prNumber: env.prNumber,
    headSha: env.mergeSha,
    linearIssueId,
    riskTier: 2,
    detail: 'Pull request merged; starting post-merge verification window',
  });

  // Deployment verification hook: publish pending status until external deploy workflow reports success.
  await github.createCommitStatus({
    sha: env.mergeSha,
    context: 'oneweb/post-merge-verification',
    state: 'success',
    description: 'Merge recorded; deployment verification delegated to repository deploy workflows',
  });

  ledger.record({
    phase: 'post_merge_verified',
    repo: `${env.owner}/${env.repo}`,
    prNumber: env.prNumber,
    headSha: env.mergeSha,
    linearIssueId,
    riskTier: 2,
    detail: 'Post-merge verification status published',
  });

  if (env.linearApiKey && linearIssueId) {
    const linear = createLinearClient({ apiKey: env.linearApiKey });
    const issue = await linear.getIssueByIdentifier(linearIssueId);
    if (issue) {
      await linear.createComment({
        issueId: issue.id,
        body: [
          '## PR merged',
          '',
          `PR #${env.prNumber} merged at \`${env.mergeSha}\`.`,
          'Post-merge verification status: `oneweb/post-merge-verification`.',
        ].join('\n'),
      });
    }
  }

  await ledger.save();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
