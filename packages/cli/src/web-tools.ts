import type { ToolDef } from '@compass_agents/core'
import { z } from 'zod'

/**
 * Web tools so the agent can do real research: search the web and read pages.
 * Keyless (DuckDuckGo HTML for search; plain GET for fetch), read-only, and
 * SSRF-safe — private/loopback hosts and non-GET are refused.
 */

const PRIVATE_HOST =
  /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fe80:|fc00:|fd)/i

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
}

/** Strip HTML to readable text. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** Parse DuckDuckGo HTML results into structured hits (titles+urls zipped with snippets). */
export function parseDuckDuckGo(html: string): SearchResult[] {
  const links: Array<{ title: string; url: string }> = []
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration
  while ((m = linkRe.exec(html)) !== null) {
    const title = htmlToText(m[2] ?? '')
    if (!title) continue
    // DDG wraps links as //duckduckgo.com/l/?uddg=<encoded-url>
    let url = m[1] ?? ''
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg?.[1]) url = decodeURIComponent(uddg[1])
    else if (url.startsWith('//')) url = `https:${url}`
    links.push({ title, url })
    if (links.length >= 8) break
  }
  const snippets: string[] = []
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration
  while ((m = snipRe.exec(html)) !== null) snippets.push(htmlToText(m[1] ?? ''))
  return links.map((l, i) => ({ ...l, snippet: snippets[i] ?? '' }))
}

export interface WebToolsOpts {
  fetchImpl?: typeof fetch
  /** Cap returned text (chars). Default 6000. */
  maxChars?: number
}

export function makeWebTools(opts: WebToolsOpts = {}): ToolDef[] {
  const fetchImpl = opts.fetchImpl ?? fetch
  const maxChars = opts.maxChars ?? 6000

  const search: ToolDef<{ query: string }> = {
    name: 'web.search',
    description:
      'Search the web and return the top results (title, snippet, link). Use to find current ' +
      'information, prices, news, or sources before answering.',
    schema: z.object({ query: z.string().min(1) }),
    run: async args => {
      const res = await fetchImpl(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
        { headers: { 'user-agent': 'Mozilla/5.0 (compass-agent)' } },
      )
      const results = parseDuckDuckGo(await res.text()).slice(0, 5)
      if (!results.length) return { content: `no results for "${args.query}"`, ok: true }
      return {
        content: results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
          .join('\n\n'),
        ok: true,
      }
    },
  }

  const fetchPage: ToolDef<{ url: string }> = {
    name: 'web.fetch',
    description:
      'Fetch a web page or JSON API (GET only) and return its readable text. Read-only; private/' +
      'loopback hosts are refused. Use to read an article or a result you found via web.search.',
    schema: z.object({ url: z.string().url() }),
    run: async args => {
      let u: URL
      try {
        u = new URL(args.url)
      } catch {
        return { content: 'invalid URL', ok: false }
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return { content: 'only http(s) URLs are allowed', ok: false }
      }
      if (PRIVATE_HOST.test(u.hostname)) {
        return { content: 'refused: private/loopback host', ok: false }
      }
      const res = await fetchImpl(args.url, { headers: { 'user-agent': 'compass-agent/0.1' } })
      const ct = res.headers.get('content-type') ?? ''
      const body = await res.text()
      const text = ct.includes('json') ? body : htmlToText(body)
      return { content: text.slice(0, maxChars), ok: res.ok }
    },
  }

  return [search, fetchPage]
}
