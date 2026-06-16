import type { ToolCall, ToolDef } from '../tools/types'

export type ApprovalMode = 'strict' | 'prompt' | 'off'

export interface ApprovalDecision {
  allowed: boolean
  reason?: string
}

export type Prompter = (call: ToolCall, tool: ToolDef) => Promise<boolean>

/** Hard-deny patterns applied in EVERY mode, including `off`. */
export const DEFAULT_DENY_PATTERNS: RegExp[] = [
  /rm\s+-rf?\s+\//,
  /git\s+reset\s+--hard/,
  /chmod\s+777/,
  /:\(\)\s*\{.*\}\s*;/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
]

export interface ApprovalGateOpts {
  mode: ApprovalMode
  prompter?: Prompter
  denyPatterns?: RegExp[]
}

/**
 * Convenience approval layer. Note: in compass the real security floor is the
 * on-chain caveat set on a delegation — this gate is UX, plus a hard deny-list
 * that fires regardless of mode.
 */
export class ApprovalGate {
  private readonly mode: ApprovalMode
  private prompter: Prompter | undefined
  private readonly denyPatterns: RegExp[]
  private readonly sessionAllowed = new Set<string>()

  constructor(opts: ApprovalGateOpts) {
    this.mode = opts.mode
    this.prompter = opts.prompter
    this.denyPatterns = opts.denyPatterns ?? DEFAULT_DENY_PATTERNS
  }

  /** Set/replace the prompter that authorizes dangerous tools (e.g. a terminal y/N). */
  setPrompter(prompter: Prompter): void {
    this.prompter = prompter
  }

  private hardDenied(call: ToolCall): boolean {
    const probe = `${call.name} ${stringifyArgs(call.args)}`
    return this.denyPatterns.some(p => p.test(probe))
  }

  async check(call: ToolCall, tool: ToolDef): Promise<ApprovalDecision> {
    if (this.hardDenied(call)) return { allowed: false, reason: 'matched hard deny pattern' }
    if (this.mode === 'off') return { allowed: true }
    if (!tool.dangerous) return { allowed: true }
    if (this.mode === 'strict') {
      return { allowed: false, reason: 'dangerous tool denied in strict mode' }
    }
    if (this.sessionAllowed.has(tool.name)) return { allowed: true }
    if (!this.prompter) return { allowed: false, reason: 'no prompter configured' }
    const ok = await this.prompter(call, tool)
    return ok ? { allowed: true } : { allowed: false, reason: 'operator denied' }
  }

  allowForSession(toolName: string): void {
    this.sessionAllowed.add(toolName)
  }
}

function stringifyArgs(args: unknown): string {
  try {
    return JSON.stringify(args) ?? ''
  } catch {
    return String(args)
  }
}
