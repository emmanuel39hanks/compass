/**
 * Live Venice check. Run: `bun test/local/venice.live.ts`
 * Requires: VENICE_API_KEY (free key from venice.ai/settings/api/keys).
 *
 * Prints a real completion + token usage, proving the brain provider works
 * against the live OpenAI-compatible endpoint.
 */
import { VeniceBrain } from '@compass_agents/brain-venice'

const apiKey = process.env.VENICE_API_KEY
if (!apiKey) {
  console.error('set VENICE_API_KEY (see .env.example)')
  process.exit(1)
}

const brain = new VeniceBrain({
  apiKey,
  model: process.env.VENICE_MODEL ?? 'qwen3-235b-a22b-instruct-2507',
})

const turn = await brain.infer({
  system: 'You are a terse assistant. Answer in one short sentence.',
  messages: [{ role: 'user', content: 'In one line, what is ERC-7710 redelegation?' }],
  tools: [],
})

console.log('content:', turn.content)
console.log('usage  :', turn.usage)
