import { expect, test } from 'bun:test'
import { htmlToText, makeWebTools, parseDuckDuckGo } from './web-tools'

const DDG_HTML = `
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Feth&rut=x">Ethereum price today</a>
  <a class="result__snippet" href="x">The live ETH price is $1,800 right now.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ffoo.com%2Fnews">ETH news</a>
  <a class="result__snippet" href="y">Latest Ethereum headlines.</a>
</div>`

test('htmlToText strips tags + decodes entities', () => {
  expect(htmlToText('<p>hi &amp; <b>bye</b></p>')).toBe('hi & bye')
})

test('parseDuckDuckGo extracts title, decoded url, snippet', () => {
  const r = parseDuckDuckGo(DDG_HTML)
  expect(r).toHaveLength(2)
  expect(r[0]).toEqual({
    title: 'Ethereum price today',
    url: 'https://example.com/eth',
    snippet: 'The live ETH price is $1,800 right now.',
  })
  expect(r[1]?.url).toBe('https://foo.com/news')
})

test('web.search returns formatted top results', async () => {
  const fetchImpl = (async () => new Response(DDG_HTML)) as unknown as typeof fetch
  const [search] = makeWebTools({ fetchImpl })
  const res = await search!.run({ query: 'eth price' }, {} as never)
  expect(res.ok).toBe(true)
  expect(res.content).toContain('Ethereum price today')
  expect(res.content).toContain('https://example.com/eth')
})

test('web.fetch refuses private/loopback hosts (SSRF guard)', async () => {
  const fetchImpl = (async () => new Response('nope')) as unknown as typeof fetch
  const tools = makeWebTools({ fetchImpl })
  const fetchTool = tools.find(t => t.name === 'web.fetch')!
  for (const url of [
    'http://localhost:8080',
    'http://127.0.0.1/x',
    'http://169.254.169.254/meta',
  ]) {
    const res = await fetchTool.run({ url }, {} as never)
    expect(res.ok).toBe(false)
    expect(res.content).toContain('refused')
  }
})

test('web.fetch returns readable text for an allowed URL', async () => {
  const fetchImpl = (async () =>
    new Response('<html><body><h1>Title</h1><p>Body text.</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch
  const fetchTool = makeWebTools({ fetchImpl }).find(t => t.name === 'web.fetch')!
  const res = await fetchTool.run({ url: 'https://example.com' }, {} as never)
  expect(res.ok).toBe(true)
  expect(res.content).toContain('Title')
  expect(res.content).toContain('Body text.')
})
