import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LedgerEntry, LifecyclePhase } from './types';

export class RunLedger {
  private readonly filePath: string;
  private entries: LedgerEntry[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.entries = JSON.parse(raw) as LedgerEntry[];
    } catch {
      this.entries = [];
    }
  }

  record({
    phase,
    repo,
    prNumber,
    headSha,
    linearIssueId,
    riskTier,
    detail,
    metadata,
  }: Omit<LedgerEntry, 'timestamp'>): LedgerEntry {
    const entry: LedgerEntry = {
      timestamp: new Date().toISOString(),
      phase,
      repo,
      prNumber,
      headSha,
      linearIssueId,
      riskTier,
      detail,
      metadata,
    };
    this.entries.push(entry);
    return entry;
  }

  getRetryCount(prNumber: number, headSha: string): number {
    return this.entries.filter(
      (entry) =>
        entry.prNumber === prNumber &&
        entry.headSha === headSha &&
        (entry.phase === 'audit_fail' || entry.phase === 'remediation_dispatched'),
    ).length;
  }

  latestPhase(prNumber: number): LifecyclePhase | null {
    const prEntries = this.entries.filter((entry) => entry.prNumber === prNumber);
    if (prEntries.length === 0) {
      return null;
    }
    return prEntries[prEntries.length - 1].phase;
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.entries, null, 2)}\n`, 'utf8');
  }

  toJson(): LedgerEntry[] {
    return [...this.entries];
  }
}

export function defaultLedgerPath(repo: string, prNumber: number): string {
  return join(process.cwd(), '.github/pr-governance/ledger', repo.replace('/', '-'), `${prNumber}.json`);
}
