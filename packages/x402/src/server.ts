import { decodePaymentHeader } from './client'
import type { X402Facilitator } from './facilitator'
import { DEFAULT_PAYMENT_HEADER, type PaymentRequirements } from './types'

export interface X402ResourceOpts {
  /** What the buyer must pay (scheme/network/amount/payTo/asset). */
  requirements: PaymentRequirements
  facilitator: X402Facilitator
  /** Produce the resource body once payment settles. */
  resource: () => unknown | Promise<unknown>
  header?: string
  x402Version?: number
}

export interface X402Outcome {
  status: number
  body: unknown
  /** Response headers to set (e.g. the settlement proof). */
  headers: Record<string, string>
}

const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE'

function paymentRequired(opts: X402ResourceOpts, error: string): X402Outcome {
  return {
    status: 402,
    body: { x402Version: opts.x402Version ?? 1, accepts: [opts.requirements], error },
    headers: {},
  }
}

/**
 * The seller side of x402, transport-agnostic. No payment → 402 with the
 * requirements; a valid payment header → settle via the facilitator (redeem the
 * delegation) → 200 + the resource, plus the settlement tx in a proof header. An
 * invalid/unsettleable payment → 402 again. Map the {@link X402Outcome} to your
 * server's Response.
 */
export async function handleX402(
  paymentHeader: string | null | undefined,
  opts: X402ResourceOpts,
): Promise<X402Outcome> {
  if (!paymentHeader) return paymentRequired(opts, 'payment required')

  let payment: ReturnType<typeof decodePaymentHeader>
  try {
    payment = decodePaymentHeader(paymentHeader)
  } catch {
    return paymentRequired(opts, 'malformed payment header')
  }

  try {
    const { txHash } = await opts.facilitator.settle(payment)
    return {
      status: 200,
      body: await opts.resource(),
      headers: { [PAYMENT_RESPONSE_HEADER]: txHash },
    }
  } catch (err) {
    return paymentRequired(opts, `settlement failed: ${(err as Error).message}`)
  }
}

export interface ServeX402Opts extends X402ResourceOpts {
  port?: number
  hostname?: string
  /** Only this path is paywalled; others 404. Default `/`. */
  path?: string
}

export interface X402Server {
  port: number
  url: string
  stop: () => void
}

/** Serve a single paywalled resource over HTTP (Bun). `port: 0` → ephemeral. */
export function serveX402(opts: ServeX402Opts): X402Server {
  const hostname = opts.hostname ?? '127.0.0.1'
  const path = opts.path ?? '/'
  const header = opts.header ?? DEFAULT_PAYMENT_HEADER
  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname,
    fetch: async (req: Request): Promise<Response> => {
      const url = new URL(req.url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const outcome = await handleX402(req.headers.get(header), opts)
      return Response.json(outcome.body, { status: outcome.status, headers: outcome.headers })
    },
  })
  const port = server.port ?? opts.port ?? 0
  return { port, url: `http://${hostname}:${port}`, stop: () => server.stop(true) }
}
