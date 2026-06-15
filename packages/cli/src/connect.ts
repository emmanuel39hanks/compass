import { exec } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { USDC_BY_CHAIN, parseBudget, tokenDecimals } from '@compass_agents/delegation'
import { type Address, parseUnits, toHex } from 'viem'

/**
 * Browser "Connect MetaMask" flow. The CLI serves a local page, opens it, and the
 * user connects MetaMask and grants the agent a USDC spending budget via ERC-7715
 * (`wallet_requestExecutionPermissions`) — the real MetaMask Smart Accounts
 * advanced-permissions popup. The granted permission context comes back to the
 * CLI; the agent redeems it (gaslessly, via 1Shot) within the budget.
 *
 * ERC-7715 advanced permissions are Flask-first. With normal MetaMask the page
 * surfaces a clear message and you can fall back to a local key (`compass init`).
 */

export interface ConnectOptions {
  /** The grantee/redeemer the budget is granted to (the 1Shot relayer target). */
  grantee: Address
  chainId: number
  /** e.g. "25 USDC/week". */
  budget: string
  rpcUrl?: string
  /** Where to persist the granted permission. */
  outPath: string
  port?: number
  hostname?: string
  open?: (url: string) => void
}

export interface GrantedPermission {
  chainId: number
  account: Address
  grantee: Address
  /** Opaque permission context (a delegation) the agent redeems. */
  permissionsContext: string
  accountMeta?: unknown
  signerMeta?: unknown
  budget: { token: string; amount: string; period: string }
  grantedAt: string
}

const PERIOD_SECONDS: Record<string, number> = { day: 86_400, week: 604_800, month: 2_592_000 }

/** Build the ERC-7715 permission request the page will send to MetaMask. */
export function buildPermissionsRequest(opts: {
  chainId: number
  grantee: Address
  token: Address
  periodAmount: bigint
  periodSeconds: number
  startTime: number
  expiry: number
}) {
  return [
    {
      chainId: toHex(opts.chainId),
      expiry: opts.expiry,
      signer: { type: 'account', data: { address: opts.grantee } },
      permission: {
        type: 'erc20-token-periodic',
        data: {
          token: opts.token,
          periodAmount: toHex(opts.periodAmount),
          periodDuration: opts.periodSeconds,
          startTime: opts.startTime,
          justification: 'compass agent spending budget',
        },
      },
    },
  ]
}

function defaultOpen(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
  exec(`${cmd} "${url}"`, () => {})
}

/** Serve the connect page, open the browser, and resolve when a grant arrives. */
export function runConnect(opts: ConnectOptions): Promise<GrantedPermission> {
  const hostname = opts.hostname ?? '127.0.0.1'
  const spec = parseBudget(opts.budget)
  const token = USDC_BY_CHAIN[opts.chainId]
  if (!token) throw new Error(`no USDC mapped for chain ${opts.chainId}`)
  const periodSeconds = PERIOD_SECONDS[spec.period] ?? 604_800
  const periodAmount = parseUnits(spec.amount, tokenDecimals(spec.token))
  const now = Math.floor(Date.now() / 1000)
  const request = buildPermissionsRequest({
    chainId: opts.chainId,
    grantee: opts.grantee,
    token,
    periodAmount,
    periodSeconds,
    startTime: now,
    expiry: now + 30 * 86_400,
  })
  const page = connectPage({
    chainId: opts.chainId,
    budget: `${spec.amount} ${spec.token}/${spec.period}`,
    request,
  })

  return new Promise<GrantedPermission>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.stop(true)
      reject(new Error('connect timed out — no grant received'))
    }, 5 * 60_000)

    const server = Bun.serve({
      port: opts.port ?? 0,
      hostname,
      fetch: async (req: Request): Promise<Response> => {
        const url = new URL(req.url)
        if (req.method === 'GET' && url.pathname === '/') {
          return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        }
        if (req.method === 'POST' && url.pathname === '/grant') {
          const body = (await req.json()) as {
            permissionsContext: string
            accountMeta?: unknown
            signerMeta?: unknown
            account: Address
          }
          const granted: GrantedPermission = {
            chainId: opts.chainId,
            account: body.account,
            grantee: opts.grantee,
            permissionsContext: body.permissionsContext,
            ...(body.accountMeta ? { accountMeta: body.accountMeta } : {}),
            ...(body.signerMeta ? { signerMeta: body.signerMeta } : {}),
            budget: { token: spec.token, amount: spec.amount, period: spec.period },
            grantedAt: new Date().toISOString(),
          }
          mkdirSync(dirname(opts.outPath), { recursive: true })
          writeFileSync(opts.outPath, `${JSON.stringify(granted, null, 2)}\n`)
          clearTimeout(timer)
          setTimeout(() => server.stop(true), 500)
          resolve(granted)
          return Response.json({ ok: true })
        }
        return new Response('not found', { status: 404 })
      },
    })

    const port = server.port ?? opts.port ?? 0
    ;(opts.open ?? defaultOpen)(`http://${hostname}:${port}`)
  })
}

/** The self-contained connect page (no build step; talks to window.ethereum). */
function connectPage(data: { chainId: number; budget: string; request: unknown }): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Connect MetaMask · compass</title>
<style>
:root{--ink:#15140f;--cream:#f3f1ea;--green:#1f9d55;--blue:#0376c9;--line:#e4e0d6}
*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
body{margin:0;background:var(--cream);color:var(--ink);display:grid;place-items:center;min-height:100vh}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 80px rgba(40,33,12,.15);width:440px;padding:36px;text-align:center}
h1{font-size:26px;margin:0 0 6px}.sub{color:#6f6a5c;margin:0 0 24px;font-size:15px}
.row{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid var(--line);font-size:15px}
.row b{font-weight:600}.mono{font-family:ui-monospace,monospace;font-size:13px}
button{width:100%;border:0;border-radius:999px;padding:15px;font-size:16px;font-weight:700;cursor:pointer;margin-top:20px}
.primary{background:var(--blue);color:#fff}.primary:disabled{opacity:.5;cursor:default}
.ok{color:var(--green);font-weight:700;margin-top:18px}.err{color:#c0392b;margin-top:14px;font-size:14px}
.muted{color:#6f6a5c;font-size:13px;margin-top:16px;line-height:1.5}
</style></head><body>
<div class="card">
  <h1>🧭 Connect MetaMask</h1>
  <p class="sub">Grant your compass agent a spending budget — on-chain, revocable.</p>
  <div class="row"><span>Budget</span><b>${data.budget}</b></div>
  <div class="row"><span>Network</span><b>Base ${data.chainId === 84532 ? 'Sepolia' : ''}</b></div>
  <button id="go" class="primary">Connect MetaMask &amp; grant budget</button>
  <div id="status"></div>
  <p class="muted">Uses ERC-7715 advanced permissions (MetaMask Flask). The agent can
  spend up to the budget without asking each time — and you can revoke any time.</p>
</div>
<script>
const REQUEST = ${JSON.stringify(data.request)};
const $ = id => document.getElementById(id);
function ok(m){ $('status').innerHTML = '<div class="ok">'+m+'</div>'; }
function err(m){ $('status').innerHTML = '<div class="err">'+m+'</div>'; }
$('go').onclick = async () => {
  const eth = window.ethereum;
  if(!eth){ err('MetaMask not found. Install MetaMask (Flask for advanced permissions).'); return; }
  $('go').disabled = true;
  try{
    const [account] = await eth.request({ method: 'eth_requestAccounts' });
    let result;
    try{
      result = await eth.request({ method: 'wallet_requestExecutionPermissions', params: REQUEST });
    }catch(e){
      // Some builds use the EIP method name.
      result = await eth.request({ method: 'wallet_grantPermissions', params: REQUEST });
    }
    const granted = Array.isArray(result) ? result[0] : result;
    const ctx = granted.context || granted.permissionsContext || granted.permission?.context;
    if(!ctx) throw new Error('No permission context returned');
    await fetch('/grant', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ permissionsContext: ctx, accountMeta: granted.accountMeta, signerMeta: granted.signerMeta, account }) });
    ok('✓ Budget granted. You can close this tab and return to the terminal.');
  }catch(e){
    $('go').disabled = false;
    err((e && e.message) ? e.message : 'Request was rejected. Advanced permissions need MetaMask Flask.');
  }
};
</script></body></html>`
}
