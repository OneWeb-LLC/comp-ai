import type { AuditDecision, AuditFinding, AuditResult, RiskTier } from './types';

export const INJECT_AUDIT_FAIL_LABEL = 'oneweb:inject-audit-fail';

interface RawAuditDecision {
  decision?: string;
  summary?: string;
  findings?: Array<Partial<AuditFinding>>;
}

const VALID_DECISIONS = new Set<AuditDecision>(['PASS', 'FAIL', 'CHALLENGE', 'ESCALATE']);
const VALID_SEVERITIES = new Set<AuditFinding['severity']>([
  'critical',
  'high',
  'medium',
  'low',
]);

export function parseAuditDecisionText(text: string): RawAuditDecision {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Audit response did not contain JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as RawAuditDecision;
}

export function normalizeAuditResult({
  raw,
  headSha,
  riskTier,
  retryCount,
}: {
  raw: RawAuditDecision;
  headSha: string;
  riskTier: RiskTier;
  retryCount: number;
}): AuditResult {
  const decision = normalizeDecision(raw.decision, riskTier);
  const findings = normalizeFindings(raw.findings);

  return {
    decision,
    headSha,
    riskTier,
    summary: raw.summary?.trim() || 'No summary provided by audit agent.',
    findings,
    retryCount,
    auditedAt: new Date().toISOString(),
  };
}

function normalizeDecision(value: string | undefined, riskTier: RiskTier): AuditDecision {
  if (riskTier === 3) {
    return 'ESCALATE';
  }
  const upper = value?.toUpperCase();
  if (upper && VALID_DECISIONS.has(upper as AuditDecision)) {
    return upper as AuditDecision;
  }
  return 'FAIL';
}

function normalizeFindings(findings: Array<Partial<AuditFinding>> | undefined): AuditFinding[] {
  if (!Array.isArray(findings)) {
    return [];
  }

  return findings
    .filter((finding) => finding.title && finding.detail)
    .map((finding) => ({
      severity: VALID_SEVERITIES.has(finding.severity as AuditFinding['severity'])
        ? (finding.severity as AuditFinding['severity'])
        : 'medium',
      title: finding.title as string,
      detail: finding.detail as string,
      file: finding.file,
    }));
}

export async function runClaudeAudit({
  apiKey,
  prompt,
  model = 'claude-sonnet-4-20250514',
  mockDecision,
}: {
  apiKey: string;
  prompt: string;
  model?: string;
  mockDecision?: AuditDecision;
}): Promise<string> {
  if (mockDecision) {
    return JSON.stringify({
      decision: mockDecision,
      summary:
        mockDecision === 'PASS'
          ? 'Deterministic mock audit passed (GOVERNANCE_AUDIT_MOCK).'
          : 'Injected recoverable audit failure (oneweb:inject-audit-fail).',
      findings:
        mockDecision === 'PASS'
          ? []
          : [
              {
                severity: 'medium',
                title: 'Injected audit failure for recovery proof',
                detail: 'Push remediation to rerun Gate B on the new head SHA.',
              },
            ],
    });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic audit request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = payload.content?.find((block) => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic audit response missing text content');
  }

  return textBlock.text;
}

export function resolveMockAuditDecision({
  prLabels,
  retryCount,
  mockEnabled,
}: {
  prLabels: string[];
  retryCount: number;
  mockEnabled: boolean;
}): AuditDecision | undefined {
  if (!mockEnabled) {
    return undefined;
  }
  if (prLabels.includes(INJECT_AUDIT_FAIL_LABEL) && retryCount === 0) {
    return 'FAIL';
  }
  return 'PASS';
}

export function auditDecisionToStatus(decision: AuditDecision): 'success' | 'failure' | 'pending' {
  if (decision === 'PASS') {
    return 'success';
  }
  if (decision === 'ESCALATE') {
    return 'pending';
  }
  return 'failure';
}
