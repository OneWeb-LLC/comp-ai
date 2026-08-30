# One Web PR Governance

Autonomous audit-to-merge handoff for Cursor/agent pull requests.

## Canonical flow

1. Cursor opens or updates a draft PR on an agent branch (`cursor/*`, `codex/*`, etc.).
2. **Deterministic CI** (`PR Governance / Deterministic CI`) runs typecheck on agent PRs.
3. When implementation evidence is complete (agent PR + linked Linear issue + deterministic CI green + not `oneweb:wip`), the **lifecycle controller** marks the PR ready for review.
4. **Gate B** (`PR Governance / Gate B Audit`) runs an independent Claude audit and publishes the required status check `oneweb/audit-gate` on the exact head SHA.
5. On PASS, the lifecycle controller arms GitHub native auto-merge (squash) after all tier-required checks are green.
6. On FAIL/CHALLENGE, findings are posted to the PR and linked Linear issue; auto-merge stays disabled until remediation and re-audit.
7. Tier 3/reserved-risk changes publish `oneweb/founder-approval` as pending and never auto-merge.
8. After merge, **post-merge verification** publishes `oneweb/post-merge-verification`.
9. A scheduled **stale PR sweeper** re-enqueues stalled agent PRs.

## Required secrets

| Secret | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Provided by Actions; needs `pull-requests: write` and `statuses: write` on lifecycle/audit workflows |
| `ANTHROPIC_API_KEY` | Independent Gate B Claude audit |
| `LINEAR_API_KEY` | Structured findings and merge evidence on linked Linear issues |

## Branch protection

Add these required checks for qualified Tier 2 agent paths on `main`:

- `PR Governance / Deterministic CI`
- `Security Review`
- `oneweb/audit-gate`

Tier 3 additionally requires manual founder approval via `oneweb/founder-approval`.

## Labels

| Label | Effect |
| --- | --- |
| `oneweb:inject-audit-fail` | In mock/no-key mode, forces one recoverable Gate B FAIL before PASS (label or PR body marker) |
| `oneweb:wip` | Blocks draft → ready transition |
| `oneweb:tier-3-hold` | Blocks auto-merge even if audit passes |
| `oneweb:no-auto-merge` | Blocks auto-merge |

## Run ledger

Each PR stores transition history under `.github/pr-governance/ledger/` (uploaded as workflow artifacts). Phases include `detected`, `marked_ready`, `audit_pass`, `audit_fail`, `auto_merge_armed`, `merged`, and `escalated`.

## Local tests

```bash
bun test .github/pr-governance/governance.test.ts
```

## Pilot notes (ONE-70)

- Do **not** force-merge blocked PRs such as `#4`; they must pass their own deterministic CI, seeder/build verification, and Gate B evidence.
- A new push invalidates prior audit results because Gate B binds to the current head SHA.
- Copilot/security review comments remain advisory; merge eligibility is determined by required status checks and branch rulesets.
