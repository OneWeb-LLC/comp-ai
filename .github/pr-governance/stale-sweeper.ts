#!/usr/bin/env bun
import { createGitHubClient } from './github-client';
import { defaultLedgerPath, RunLedger } from './ledger';
import { isAgentPullRequest } from './pr-detector';
import { buildPullRequestRecord } from './risk-classifier';

interface SweeperEnv {
  githubToken: string;
  owner: string;
  repo: string;
  staleHours: number;
}

function readEnv(): SweeperEnv {
  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!githubToken || !owner || !repoFull) {
    throw new Error('Missing GITHUB_TOKEN or GITHUB_REPOSITORY');
  }
  const [, repo] = repoFull.split('/');
  return {
    githubToken,
    owner,
    repo,
    staleHours: Number(process.env.STALE_HOURS ?? '24'),
  };
}

async function main(): Promise<void> {
  const env = readEnv();
  const github = createGitHubClient({
    token: env.githubToken,
    owner: env.owner,
    repo: env.repo,
  });

  const openPullRequests = await github.listOpenPullRequests();
  const staleCutoffMs = Date.now() - env.staleHours * 60 * 60 * 1000;
  const candidates = [];

  for (const pr of openPullRequests) {
    if (!isAgentPullRequest({ pr })) {
      continue;
    }

    const ledger = new RunLedger(defaultLedgerPath(`${env.owner}/${env.repo}`, pr.number));
    await ledger.load();
    const latestPhase = ledger.latestPhase(pr.number);
    const updatedAt = new Date((pr as { updated_at?: string }).updated_at ?? 0).getTime();
    const isStale = updatedAt < staleCutoffMs;
    const isStalled =
      pr.draft ||
      latestPhase === 'audit_fail' ||
      latestPhase === 'remediation_dispatched' ||
      latestPhase === 'detected';

    if (isStale && isStalled) {
      candidates.push(pr.number);
      ledger.record({
        phase: 'detected',
        repo: `${env.owner}/${env.repo}`,
        prNumber: pr.number,
        headSha: pr.head.sha,
        linearIssueId: null,
        riskTier: buildPullRequestRecord({
          repo: `${env.owner}/${env.repo}`,
          pr,
          changedFiles: [],
        }).riskTier,
        detail: 'Stale PR sweeper re-enqueued lifecycle controller',
      });
      await ledger.save();
    }
  }

  console.log(JSON.stringify({ staleCandidates: candidates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
