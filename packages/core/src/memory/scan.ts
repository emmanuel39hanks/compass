/**
 * Threat-pattern scan applied to every memory write. A memory file is later
 * injected into the brain's prompt, so malicious content = persistent prompt
 * injection, and a leaked secret in memory is a leaked secret forever. Reject on
 * any match. MVP list — extend over time.
 */
const PATTERNS: Array<{ id: string; regex: RegExp; reason: string }> = [
  {
    id: 'ignore-previous-instructions',
    regex: /ignore (all |any |previous |prior )?instructions/i,
    reason: 'Prompt injection attempt (ignore-instructions directive).',
  },
  {
    id: 'role-override',
    regex: /you are (now |actually |a )[^.\n]{3,80}/i,
    reason: 'Prompt injection attempt (role override).',
  },
  {
    id: 'system-prompt-request',
    regex: /(print|show|reveal|output) (your|the) (system )?prompt/i,
    reason: 'Prompt injection attempt (system-prompt exfil).',
  },
  {
    id: 'invisible-unicode',
    // Explicit alternation to avoid ZWJ-composed character classes. Covers
    // zero-width space/joiners, BOM, and Unicode bidi override markers.
    regex: /​|‌|‍|﻿|⁠|‪|‫|‬|‭|‮/u,
    reason: 'Invisible unicode detected (possible hidden instruction).',
  },
  {
    id: 'private-key',
    regex: /\b0x[0-9a-fA-F]{64}\b/,
    reason: 'Looks like a private key (32-byte hex) — never store secrets in memory.',
  },
  {
    id: 'mnemonic-seed',
    regex: /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/i,
    reason: 'Looks like a BIP-39 seed phrase — never store secrets in memory.',
  },
  {
    id: 'api-key',
    regex:
      /\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
    reason: 'Looks like an API key/token — never store credentials in memory.',
  },
  {
    id: 'private-key-claim',
    regex: /(private|secret) key is\b/i,
    reason: 'Suspicious private-key disclosure in memory content.',
  },
  {
    id: 'exfil-sink',
    regex:
      /(curl|fetch|wget|nc) [^\n]{10,}[@:.]([a-z0-9.-]+\.(?!(compass|base|local|localhost|127\.0\.0\.1))[a-z]{2,})/i,
    reason: 'Command-line exfiltration pattern in memory content.',
  },
]

export interface ThreatViolation {
  id: string
  reason: string
}

export interface ThreatScanResult {
  ok: boolean
  violations: ThreatViolation[]
}

/** Scan content for prompt-injection + credential-leak patterns. */
export function scanForThreats(content: string): ThreatScanResult {
  const violations: ThreatViolation[] = []
  for (const p of PATTERNS) {
    if (p.regex.test(content)) violations.push({ id: p.id, reason: p.reason })
  }
  return { ok: violations.length === 0, violations }
}
