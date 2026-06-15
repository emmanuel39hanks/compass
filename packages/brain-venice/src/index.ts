/**
 * @compass_agents/brain-venice — Venice AI brain provider.
 *
 * Implements the @compass_agents/core Brain interface against Venice's
 * OpenAI-compatible endpoint, with tool calling on Qwen-class models, plus an
 * image media tool. See docs/INTEGRATIONS.md#venice.
 */
export const PACKAGE = '@compass_agents/brain-venice' as const
export const ROLE = 'venice brain provider' as const

export * from './wire'
export * from './venice-brain'
export * from './media'
