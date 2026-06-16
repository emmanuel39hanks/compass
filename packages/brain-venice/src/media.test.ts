import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import {
  buildImageRequest,
  decodeBase64,
  makeVeniceImageTool,
  makeVeniceMediaTools,
  makeVeniceSpeechTool,
  makeVeniceVisionTool,
} from './media'
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

test('decodeBase64 handles plain + data-URI', () => {
  expect(Array.from(decodeBase64(btoa('hi')))).toEqual([104, 105])
  expect(Array.from(decodeBase64(`data:image/png;base64,${btoa('hi')}`))).toEqual([104, 105])
})

test('venice.image saves bytes through the save sink', async () => {
  const saved: string[] = []
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ images: [btoa('PNG')] }), { status: 200 }),
    )) as unknown as FetchImpl
  const tool = makeVeniceImageTool({
    apiKey: 'k',
    fetchImpl,
    save: (name, bytes) => {
      saved.push(`${name}:${bytes.length}`)
      return `/m/${name}`
    },
  })
  const r = await tool.run({ prompt: 'a cat' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toContain('/m/image-')
  expect(saved[0]).toContain(':3') // "PNG" = 3 bytes
})

test('venice.vision returns the model description', async () => {
  let body: { model?: string; messages?: unknown[] } = {}
  const fetchImpl = ((_url: string, init: { body: string }) => {
    body = JSON.parse(init.body)
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: 'a red apple' } }] }), {
        status: 200,
      }),
    )
  }) as unknown as FetchImpl
  const tool = makeVeniceVisionTool({ apiKey: 'k', fetchImpl, visionModel: 'qwen-vl' })
  const r = await tool.run({ imageUrl: 'https://img/x.png', prompt: 'what is this?' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toBe('a red apple')
  expect(body.model).toBe('qwen-vl')
})

test('venice.speak saves audio bytes', async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    )) as unknown as FetchImpl
  let savedName = ''
  const tool = makeVeniceSpeechTool({
    apiKey: 'k',
    fetchImpl,
    save: (name, bytes) => {
      savedName = name
      return `/m/${name}:${bytes.length}`
    },
  })
  const r = await tool.run({ text: 'hello' }, ctx())
  expect(r.ok).toBe(true)
  expect(savedName).toContain('speech-')
  expect(r.content).toContain(':4')
})

test('makeVeniceMediaTools returns image + vision + speak', () => {
  const tools = makeVeniceMediaTools({ apiKey: 'k' })
  expect(tools.map(t => t.name)).toEqual(['venice.image', 'venice.vision', 'venice.speak'])
})
