import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import { buildImageRequest, makeVeniceImageTool } from './media'
import type { FetchImpl } from './venice-brain'

const ctx = (): ToolContext => ({ memory: undefined as never })

test('buildImageRequest defaults aspect ratio and resolution', () => {
  expect(buildImageRequest({ prompt: 'a cat' }, 'gpt-image-2')).toEqual({
    model: 'gpt-image-2',
    prompt: 'a cat',
    aspect_ratio: '1:1',
    resolution: '1K',
  })
})

test('venice.image tool reports the generated count', async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ images: ['base64...'] }), { status: 200 }),
    )) as unknown as FetchImpl
  const tool = makeVeniceImageTool({ apiKey: 'k', fetchImpl })
  const r = await tool.run({ prompt: 'a cat' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toContain('generated 1')
})

test('venice.image tool surfaces an error status', async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response('err', { status: 500 }))) as unknown as FetchImpl
  const tool = makeVeniceImageTool({ apiKey: 'k', fetchImpl })
  const r = await tool.run({ prompt: 'x' }, ctx())
  expect(r.ok).toBe(false)
})
