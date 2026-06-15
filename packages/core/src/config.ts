import { z } from 'zod'

export const ApprovalModeSchema = z.enum(['strict', 'prompt', 'off'])

export const CompassConfigSchema = z.object({
  identity: z.object({
    smartAccount: z.string().optional(),
    agentId: z.string().optional(),
    agentName: z.string().optional(),
    keystorePath: z.string().optional(),
    signerSource: z
      .enum(['privkey', 'keystore', 'walletconnect', 'metamask', 'embedded'])
      .default('privkey'),
  }),
  network: z.object({
    name: z.string().optional(),
    chainId: z.number().int().positive(),
    rpcUrl: z.string().url(),
  }),
  brain: z.object({
    provider: z.literal('venice').default('venice'),
    model: z.string().default('qwen3-next-80b'),
    baseUrl: z.string().url().default('https://api.venice.ai/api/v1'),
  }),
  relayer: z
    .object({
      endpoint: z.string().url().default('https://relayer.1shotapi.com/relayers'),
    })
    .optional(),
  approvals: z
    .object({
      mode: ApprovalModeSchema.default('prompt'),
    })
    .default({ mode: 'prompt' }),
  plugins: z.array(z.string()).default([]),
  budget: z
    .object({
      token: z.string().default('USDC'),
      amount: z.string(),
      period: z.enum(['day', 'week', 'month']).default('week'),
    })
    .optional(),
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      botTokenEnv: z.string().default('COMPASS_TELEGRAM_TOKEN'),
    })
    .optional(),
})

export type CompassConfig = z.infer<typeof CompassConfigSchema>
export type CompassConfigInput = z.input<typeof CompassConfigSchema>

/** Authoring helper — typed pass-through used in `compass.config.ts`. */
export function defineConfig(config: CompassConfigInput): CompassConfigInput {
  return config
}

export function parseConfig(input: unknown): CompassConfig {
  return CompassConfigSchema.parse(input)
}
