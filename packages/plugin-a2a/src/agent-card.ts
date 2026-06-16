/**
 * A2A AgentCard (the Linux-Foundation Agent2Agent standard) — the JSON document
 * served at `/.well-known/agent-card.json` that lets other agents discover this
 * agent's identity, endpoint, and skills. Building one makes a compass agent
 * discoverable by the wider A2A ecosystem, not just by peers it already knows.
 */

export interface AgentSkill {
  id: string
  name: string
  description: string
  tags: string[]
  examples?: string[]
}

export interface AgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  provider?: { organization: string; url?: string }
  capabilities: { streaming: boolean; pushNotifications: boolean }
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: AgentSkill[]
}

/** Map a compass tool name to an advertised A2A skill (the ones worth surfacing). */
const SKILL_FOR: Record<string, Omit<AgentSkill, 'id'>> = {
  'chain.send': {
    name: 'Send USDC',
    description: 'Send USDC on-chain within a budget — gas paid in USDC, no ETH.',
    tags: ['payments', 'onchain', 'usdc'],
    examples: ['send 5 USDC to 0x…'],
  },
  'a2a.hire': {
    name: 'Hire an agent',
    description:
      'Delegate a bounded, revocable budget to a specialist agent to act on your behalf.',
    tags: ['a2a', 'redelegation', 'erc-7710'],
    examples: ['hire a helper to pay 2 USDC to 0x…'],
  },
  pay: {
    name: 'Pay for data (x402)',
    description:
      'Buy a paid (x402) resource — a dataset, API, or compute — from a delegated allowance.',
    tags: ['x402', 'payments', 'data'],
    examples: ['buy the crypto-price dataset at https://…'],
  },
  discover: {
    name: 'Discover services',
    description: 'Search the x402 Bazaar for payable datasets, APIs, and services.',
    tags: ['x402', 'discovery', 'bazaar'],
    examples: ['find a weather dataset'],
  },
  'web.search': {
    name: 'Research the web',
    description: 'Search the web and read pages to answer questions.',
    tags: ['research', 'web'],
    examples: ['research ETH staking yields'],
  },
  'venice.image': {
    name: 'Generate images',
    description: 'Create images from a text prompt via Venice.',
    tags: ['media', 'venice', 'image'],
    examples: ['draw a compass logo, flat style'],
  },
  'venice.vision': {
    name: 'Analyze images',
    description: 'Look at an image and answer questions about it via Venice vision.',
    tags: ['media', 'venice', 'vision'],
  },
  'venice.speak': {
    name: 'Text to speech',
    description: 'Turn text into spoken audio via Venice.',
    tags: ['media', 'venice', 'audio'],
  },
}

export interface BuildAgentCardOpts {
  name: string
  url: string
  description?: string
  version?: string
  /** Org behind the agent. */
  organization?: string
  /** Tool names the agent has — advertised as skills when recognized. */
  toolNames?: string[]
  /** Extra skills to advertise beyond the tool-derived ones. */
  extraSkills?: AgentSkill[]
}

/** Build a standard A2A AgentCard from a compass agent's identity + toolset. */
export function buildAgentCard(opts: BuildAgentCardOpts): AgentCard {
  const skills: AgentSkill[] = []
  const seen = new Set<string>()
  for (const name of opts.toolNames ?? []) {
    const s = SKILL_FOR[name]
    if (s && !seen.has(name)) {
      seen.add(name)
      skills.push({ id: name, ...s })
    }
  }
  for (const s of opts.extraSkills ?? []) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      skills.push(s)
    }
  }
  return {
    protocolVersion: '0.3.0',
    name: opts.name,
    description:
      opts.description ??
      'A personal on-chain agent: acts within strict, revocable spending limits — pays, hires other agents, and buys data, all gaslessly on Base.',
    url: opts.url,
    version: opts.version ?? '0.1.0',
    provider: { organization: opts.organization ?? 'compass' },
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills,
  }
}
