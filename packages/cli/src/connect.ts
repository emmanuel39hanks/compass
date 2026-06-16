import { exec } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { USDC_BY_CHAIN, parseBudget, tokenDecimals } from '@compass_agents/delegation'
import { type Address, toHex } from 'viem'

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

/**
 * Build the ERC-7715 `wallet_requestExecutionPermissions` request the page sends
 * to MetaMask. Shape per the MetaMask Smart Accounts Kit advanced-permissions
 * reference: the grantee is `to` (the session account), the budget lives in
 * `permission.data`, and `isAdjustmentAllowed` lets the user tweak the cap before
 * approving. The recurring cap is bounded by `periodAmount`/`periodDuration`.
 *
 * Note: `signer`/`token`/`startTime` are the older `grantPermissions` shape and a
 * top-level `expiry` is likewise rejected by this method ("expiry — Expected a value
 * of type `never`"). `rules` IS required at the top level (an array of extra
 * constraints — empty when there are none), or MetaMask returns "0.rules: Required".
 */
export function buildPermissionsRequest(opts: {
  chainId: number
  grantee: Address
  token: Address
  periodAmount: bigint
  periodSeconds: number
}) {
  return [
    {
      chainId: toHex(opts.chainId),
      to: opts.grantee,
      permission: {
        type: 'erc20-token-periodic',
        data: {
          tokenAddress: opts.token,
          periodAmount: toHex(opts.periodAmount),
          periodDuration: opts.periodSeconds,
          justification: 'compass agent spending budget',
        },
        isAdjustmentAllowed: true,
      },
      rules: [],
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
  // The page builds the ERC-7715 request client-side so the user can lower the
  // amount before granting — e.g. to match what their wallet can actually fund.
  const page = connectPage({
    chainId: opts.chainId,
    grantee: opts.grantee,
    token,
    symbol: spec.token,
    decimals: tokenDecimals(spec.token),
    amount: spec.amount,
    period: spec.period,
    ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
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
            budget?: { amount: string; period: string }
          }
          const granted: GrantedPermission = {
            chainId: opts.chainId,
            account: body.account,
            grantee: opts.grantee,
            permissionsContext: body.permissionsContext,
            ...(body.accountMeta ? { accountMeta: body.accountMeta } : {}),
            ...(body.signerMeta ? { signerMeta: body.signerMeta } : {}),
            // Record the budget actually granted (the user can lower it on the page).
            budget: {
              token: spec.token,
              amount: body.budget?.amount ?? spec.amount,
              period: body.budget?.period ?? spec.period,
            },
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

/**
 * The self-contained connect page (no build step; talks to window.ethereum).
 * Flat styling, the compass wordmark, and an editable budget — the user can lower
 * the amount/period right here, then the page builds the ERC-7715 request
 * client-side (mirroring {@link buildPermissionsRequest}) and posts the grant back.
 */
function connectPage(data: {
  chainId: number
  grantee: Address
  token: Address
  symbol: string
  decimals: number
  amount: string
  period: string
  rpcUrl?: string
}): string {
  // Only Base / Base Sepolia are supported (see NETWORKS in init.ts). These params
  // also feed wallet_addEthereumChain so the page can switch MetaMask to the right
  // network before requesting the grant — a mismatch otherwise errors or, worse,
  // grants on the wrong chain (and the 1Shot relayer for that chain can't redeem it).
  const meta =
    data.chainId === 8_453
      ? { name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' }
      : {
          name: 'Base Sepolia',
          rpc: 'https://sepolia.base.org',
          explorer: 'https://sepolia.basescan.org',
        }
  const net = meta.name
  const cfg = JSON.stringify({
    chainId: toHex(data.chainId),
    to: data.grantee,
    token: data.token,
    decimals: data.decimals,
    chain: {
      chainId: toHex(data.chainId),
      chainName: meta.name,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [data.rpcUrl || meta.rpc],
      blockExplorerUrls: [meta.explorer],
    },
  })
  const opt = (p: string) =>
    `<option value="${p}"${p === data.period ? ' selected' : ''}>${p}</option>`
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>compass · connect</title>
<style>
:root{--ink:#15140f;--cream:#f3f1ea;--paper:#fff;--green:#1f9d55;--blue:#0376c9;--line:#e4e0d6;--dim:#6f6a5c}
*{box-sizing:border-box;font-family:'Avenir Next','Avenir',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}
body{margin:0;background:var(--cream);color:var(--ink);display:grid;place-items:center;min-height:100vh;padding:24px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;width:420px;max-width:100%;padding:32px}
.brand{font-size:27px;font-weight:600;letter-spacing:-.02em;margin:0}
.sub{color:var(--dim);margin:8px 0 26px;font-size:14px;line-height:1.55}
.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:0 0 8px;font-weight:600}
.budget{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.budget input{border:0;outline:0;font-size:22px;font-weight:600;width:96px;color:var(--ink);background:transparent;-moz-appearance:textfield}
.budget input::-webkit-outer-spin-button,.budget input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.budget .unit{font-size:15px;font-weight:600}
.budget .slash{color:var(--dim)}
.budget select{border:0;outline:0;font-size:15px;font-weight:600;color:var(--ink);background:transparent;cursor:pointer;margin-left:auto}
.row{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-size:14px;color:var(--dim)}
.row b{color:var(--ink);font-weight:600}
button{width:100%;border:0;border-radius:10px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin-top:24px;background:var(--blue);color:#fff}
button:disabled{opacity:.5;cursor:default}
.ok{color:var(--green);font-weight:600;margin-top:16px;font-size:14px}
.err{color:#c0392b;margin-top:14px;font-size:13px;line-height:1.5}
.muted{color:var(--dim);font-size:12px;margin-top:18px;line-height:1.55}
a{color:var(--blue)}
</style></head><body>
<div class="card">
  <p class="brand">compass</p>
  <p class="sub">Grant your agent a spending budget — enforced on-chain and revocable any time. Set the amount to whatever you can fund.</p>
  <p class="label">Budget</p>
  <div class="budget">
    <input id="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${data.amount}"/>
    <span class="unit">${data.symbol}</span>
    <span class="slash">/</span>
    <select id="period">${opt('day')}${opt('week')}${opt('month')}</select>
  </div>
  <div class="row"><span>Network</span><b>${net}</b></div>
  <button id="go">Connect MetaMask &amp; grant budget</button>
  <div id="status"></div>
  <p class="muted">Uses ERC-7715 advanced permissions (MetaMask Flask). Your agent can spend up to this budget without asking each time — and you can revoke it whenever.</p>
</div>
<script>
const CFG = ${cfg};
const PERIODS = { day: 86400, week: 604800, month: 2592000 };
const $ = id => document.getElementById(id);
function ok(m){ $('status').innerHTML = '<div class="ok">'+m+'</div>'; }
function err(m){ $('status').innerHTML = '<div class="err">'+m+'</div>'; }
function toUnits(v){
  var parts = String(v == null ? '' : v).trim().split('.');
  var whole = (parts[0] || '0').replace(/[^0-9]/g, '');
  var frac = ((parts[1] || '').replace(/[^0-9]/g, '') + '000000000000').slice(0, CFG.decimals);
  return BigInt(((whole + frac).replace(/^0+(?=\\d)/, '')) || '0');
}
function buildRequest(){
  return [{
    chainId: CFG.chainId,
    to: CFG.to,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress: CFG.token,
        periodAmount: '0x' + toUnits($('amount').value).toString(16),
        periodDuration: PERIODS[$('period').value] || 604800,
        justification: 'compass agent spending budget'
      },
      isAdjustmentAllowed: true
    },
    rules: []
  }];
}
function flask(){
  $('status').innerHTML = '<div class="err" style="text-align:left">Your MetaMask doesn\\'t support '
   + 'advanced permissions (ERC-7715) yet.<br><br>'
   + '→ Install <a href="https://metamask.io/flask/" target="_blank"><b>MetaMask Flask</b></a> and try again, or<br>'
   + '→ close this and run <b>compass init</b> to use a generated wallet (works in any MetaMask).</div>';
}
function unsupported(e){
  const m = ((e && e.message) || '').toLowerCase();
  return (e && (e.code === 4200 || e.code === -32601)) ||
    m.includes('does not exist') || m.includes('not available') || m.includes('not supported') || m.includes('unsupported');
}
// Make sure MetaMask is on the budget's network before requesting the grant.
async function ensureChain(eth){
  try{
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CFG.chain.chainId }] });
  }catch(e){
    var code = (e && e.code != null) ? e.code : (e && e.data && e.data.originalError && e.data.originalError.code);
    if(code === 4902 || /unrecognized chain|add this network|not been added|wallet_addethereumchain/i.test((e && e.message) || '')){
      await eth.request({ method: 'wallet_addEthereumChain', params: [CFG.chain] }); // adding switches too
    } else {
      throw e;
    }
  }
}
$('go').onclick = async () => {
  const eth = window.ethereum;
  if(!eth){ err('MetaMask not found — install it (and MetaMask Flask for advanced permissions).'); return; }
  if(toUnits($('amount').value) <= 0n){ err('Enter a budget greater than 0.'); return; }
  $('go').disabled = true;
  try{
    const [account] = await eth.request({ method: 'eth_requestAccounts' });
    try{
      await ensureChain(eth); // switch to ${net} first (adds it if unknown)
    }catch(e){
      $('go').disabled = false;
      err(e && e.code === 4001 ? 'Approve the switch to ${net} in MetaMask to continue.' : 'Could not switch MetaMask to ${net}: ' + ((e && e.message) || 'unknown error'));
      return;
    }
    let result;
    try{
      result = await eth.request({ method: 'wallet_requestExecutionPermissions', params: buildRequest() });
    }catch(e){
      if(unsupported(e)){ $('go').disabled = false; flask(); return; }
      throw e;
    }
    const granted = Array.isArray(result) ? result[0] : result;
    const ctx = granted.context || granted.permissionsContext || (granted.permission && granted.permission.context);
    if(!ctx) throw new Error('No permission context returned');
    await fetch('/grant', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ permissionsContext: ctx, accountMeta: granted.accountMeta, signerMeta: granted.signerMeta, account,
        budget: { amount: $('amount').value, period: $('period').value } }) });
    ok('✓ Budget granted. Close this tab and return to the terminal.');
  }catch(e){
    $('go').disabled = false;
    if(e && e.code === 4001) err('You rejected the request.');
    else if(unsupported(e)) flask();
    else err((e && e.message) ? e.message : 'Request failed.');
  }
};
</script></body></html>`
}
