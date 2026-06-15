import type { ToolDef } from '@compass_agents/core'
import { z } from 'zod'
import type { FetchImpl } from './venice-brain'
import { VENICE_BASE_URL } from './wire'

export interface VeniceMediaOpts {
  apiKey: string
  baseUrl?: string
  fetchImpl?: FetchImpl
  /** Image model id; resolve current ids via GET /models. */
  imageModel?: string
}

export interface ImageRequest {
  model: string
  prompt: string
  aspect_ratio: string
  resolution: string
}

export function buildImageRequest(
  args: { prompt: string; aspectRatio?: string },
  model: string,
): ImageRequest {
  return {
    model,
    prompt: args.prompt,
    aspect_ratio: args.aspectRatio ?? '1:1',
    resolution: '1K',
  }
}

const ImageArgs = z.object({
  prompt: z.string().min(1).describe('What to draw.'),
  aspectRatio: z.string().optional().describe('e.g. "16:9", "1:1". Default 1:1.'),
})

/**
 * `venice.image` tool — generates an image via Venice's `/image/generate`.
 * Registering it makes Venice a multi-endpoint, "core" part of the agent.
 */
export function makeVeniceImageTool(opts: VeniceMediaOpts): ToolDef<z.infer<typeof ImageArgs>> {
  const baseUrl = (opts.baseUrl ?? VENICE_BASE_URL).replace(/\/+$/, '')
  const f = opts.fetchImpl ?? fetch
  const model = opts.imageModel ?? 'gpt-image-2'
  return {
    name: 'venice.image',
    description: 'Generate an image from a text prompt via Venice.',
    schema: ImageArgs,
    run: async args => {
      const res = await f(`${baseUrl}/image/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(buildImageRequest(args, model)),
      })
      if (!res.ok) return { content: `venice image error ${res.status}`, ok: false }
      const json = (await res.json()) as { images?: string[] }
      const n = json.images?.length ?? 0
      return { content: `generated ${n} image(s) for: ${args.prompt}`, ok: n > 0 }
    },
  }
}
