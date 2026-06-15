import { expect, test } from 'bun:test'
import type { HireGrant, RelayResult } from '@compass_agents/relayer-1shot'
import { InProcessBus } from './bus'
import { awaitHireResult, sendHire, serveHire } from './hire'

const OWNER = '0x83d412b9dc65fc728455a1AFE00cE8812CdCce13' as const
const HELPER = '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8' as const
const RECIPIENT = '0x1111111111111111111111111111111111111111' as const
const OWNER_KEY = `0x${'1'.repeat(64)}` as const
const HELPER_KEY = `0x${'2'.repeat(64)}` as const

/** A fake grant builder — captures the request, returns a deterministic grant. */
function stubGrant(captured: { grant?: HireGrant }) {
  return async (): Promise<HireGrant> => {
    const grant: HireGrant = {
      root: {
        delegate: HELPER,
        delegator: OWNER,
        authority: '0x0',
        caveats: [],
        salt: '0x1',
      } as unknown as HireGrant['root'],
      authorization: {
        address: '0x1',
        chainId: '84532',
        nonce: '0',
        r: '0x2',
        s: '0x3',
        yParity: '0',
      },
      to: RECIPIENT,
      amount: '100000',
      chainId: 84_532,
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    }
    captured.grant = grant
    return grant
  }
}

test('the hire handshake: owner grants → helper redeems → owner gets the result', async () => {
  const bus = new InProcessBus()
  const built: { grant?: HireGrant } = {}
  let redeemed: HireGrant | undefined

  serveHire({
    transport: bus,
    self: 'helper',
    peerKey: HELPER_KEY,
    endpoint: 'stub',
    redeem: async ({ grant }) => {
      redeemed = grant
      return { taskId: '0xabc', status: 200, hash: '0xdeadbeef' } as RelayResult
    },
  })

  const resultP = awaitHireResult(bus, 'owner', 'helper', 5_000)
  await sendHire({
    transport: bus,
    from: 'owner',
    to: 'helper',
    helperAccount: HELPER,
    ownerKey: OWNER_KEY,
    task: 'send 0.1 USDC',
    recipient: RECIPIENT,
    amount: 100_000n,
    chainId: 84_532,
    endpoint: 'stub',
    buildGrant: stubGrant(built),
  })

  const result = await resultP
  expect(result.status).toBe(200)
  expect(result.taskId).toBe('0xabc')
  // the grant the helper redeemed is exactly the one the owner built (integrity over the wire)
  expect(redeemed).toEqual(built.grant)
})

test('an accept policy can decline a hire; the owner sees a rejection', async () => {
  const bus = new InProcessBus()
  serveHire({
    transport: bus,
    self: 'helper',
    peerKey: HELPER_KEY,
    endpoint: 'stub',
    accept: () => false,
    redeem: async () => {
      throw new Error('should not redeem a declined hire')
    },
  })

  const resultP = awaitHireResult(bus, 'owner', 'helper', 5_000)
  await sendHire({
    transport: bus,
    from: 'owner',
    to: 'helper',
    helperAccount: HELPER,
    ownerKey: OWNER_KEY,
    task: 'send 0.1 USDC',
    recipient: RECIPIENT,
    amount: 100_000n,
    chainId: 84_532,
    endpoint: 'stub',
    buildGrant: stubGrant({}),
  })

  await expect(resultP).rejects.toThrow(/declined/)
})

test('awaitHireResult rejects on timeout when no reply comes', async () => {
  const bus = new InProcessBus()
  await expect(awaitHireResult(bus, 'owner', 'ghost', 20)).rejects.toThrow(/timed out/)
})
