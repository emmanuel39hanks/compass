export interface ParsedCommand {
  name: string
  args: string[]
  flags: Record<string, string | boolean>
}

export const COMMANDS = [
  'init',
  'register',
  'chat',
  'serve',
  'pairing',
  'budget',
  'logs',
  'memory',
  'doctor',
  'delegate',
  'redelegate',
  'revoke',
  'peers',
  'status',
  'demo',
  'help',
  'version',
] as const

export type CommandName = (typeof COMMANDS)[number]

/** Parse `argv` (without node/script) into a command, positional args, flags. */
export function parseArgv(argv: string[]): ParsedCommand {
  const [name = 'help', ...rest] = argv
  const args: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (!token) continue
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = rest[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      args.push(token)
    }
  }
  return { name, args, flags }
}

export function isKnownCommand(name: string): name is CommandName {
  return (COMMANDS as readonly string[]).includes(name)
}

export function helpText(): string {
  return [
    'compass — multi-agent coordination via redelegation',
    '',
    'Usage: compass <command> [options]',
    '',
    'Commands:',
    '  init         Create a smart account + signer and write compass.config.ts',
    '  register     Mint your agent identity NFT on Base (own it on-chain)',
    '  chat         Talk to the principal agent (Venice brain)',
    '  serve        Run the agent as a gateway — text it from Telegram',
    '  pairing      Approve/revoke/list who can reach your agent',
    '  budget       Set/show the recurring spending budget',
    '  logs         Show the activity log (tool calls + on-chain actions)',
    '  memory       Export/import encrypted, portable agent memory',
    '  doctor       Check your environment is ready for on-chain actions',
    '  delegate     Grant a root delegation from the operator account',
    '  redelegate   Redelegate a narrowed slice to a peer agent',
    '  revoke       Revoke a delegation on-chain',
    '  peers        List known agent peers',
    '  status       Show agent + live 1Shot webhook tx status',
    '  demo         Run the offline end-to-end demo spine',
    '  help         Show this help',
    '  version      Print the version',
  ].join('\n')
}
