/**
 * Verifies the `processEntry` ack contract (packages/queue-agents/src/kv.ts).
 *
 * Needs a real Valkey instance — set VALKEY_URL to run, otherwise the whole suite
 * is skipped.
 *   - a handled message is ACKed (leaves the group's pending list)
 *   - a failed handler leaves the message un-acked (stays pending → retried)
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Redis } from 'ioredis'
import {
  GROUP,
  STREAM,
  consumeReviews,
  ensureGroup,
  enqueueReview,
  processEntry,
  reclaimStale,
  closeValkey,
} from '../../packages/queue-agents/src/kv.js'

const VALKEY_URL = process.env.VALKEY_URL

describe('kv.processEntry ack semantics', { skip: !VALKEY_URL }, () => {
  let client!: Redis

  before(async () => {
    client = new Redis(VALKEY_URL!, { maxRetriesPerRequest: null })
    await client.del(STREAM) // isolate from previous runs
    await ensureGroup(client)
  })

  after(async () => {
    await client.del(STREAM)
    client.disconnect()
    await closeValkey()
  })

  async function readOne(consumer = 'tester'): Promise<{ id: string; fields: string[] } | null> {
    const res = (await client.xreadgroup(
      'GROUP',
      GROUP,
      consumer,
      'COUNT',
      1,
      'STREAMS',
      STREAM,
      '>',
    )) as Array<[string, Array<[string, string[]]>]> | null
    const entry = res?.[0]?.[1]?.[0]
    if (!entry) return null
    return { id: entry[0], fields: entry[1] }
  }

  async function pendingCount(): Promise<number> {
    const summary = (await client.xpending(STREAM, GROUP)) as [number, ...unknown[]]
    return Number(summary[0])
  }

  it('acks a message after the handler succeeds', async () => {
    await enqueueReview({ reviewId: 'r-ok', prUrl: 'https://github.com/o/r/pull/1' })
    const entry = await readOne()
    assert.ok(entry, 'expected a delivered entry')

    let handled = false
    await processEntry(client, entry.id, entry.fields, async () => {
      handled = true
    })

    assert.equal(handled, true)
    assert.equal(await pendingCount(), 0) // acked → no longer pending
  })

  it('leaves a message un-acked when the handler throws', async () => {
    await enqueueReview({ reviewId: 'r-fail', prUrl: 'https://github.com/o/r/pull/2' })
    const entry = await readOne()
    assert.ok(entry, 'expected a delivered entry')

    // Must NOT throw — a failed handler is swallowed so the loop keeps running.
    await processEntry(client, entry.id, entry.fields, async () => {
      throw new Error('boom')
    })

    assert.equal(await pendingCount(), 1) // un-acked → still pending → will retry
  })

  it('redelivers a pending message via reclaimStale until it succeeds', async () => {
    // Isolate from the prior cases' pending entries so the reclaim count is exact.
    await client.del(STREAM)
    await ensureGroup(client)
    await enqueueReview({ reviewId: 'r-retry', prUrl: 'https://github.com/o/r/pull/3' })

    // First delivery fails, leaving the entry pending (un-acked).
    const entry = await readOne('consumer-a')
    assert.ok(entry, 'expected a delivered entry')
    await processEntry(client, entry.id, entry.fields, async () => {
      throw new Error('boom')
    })
    assert.equal(await pendingCount(), 1)

    // A reclaim pass (minIdle 0) hands the stale entry to another consumer and
    // re-runs it. This time the handler succeeds, so it gets acked.
    let redelivered = false
    const claimed = await reclaimStale(
      client,
      async () => {
        redelivered = true
      },
      { consumerName: 'consumer-b', minIdleMs: 0 },
    )

    assert.equal(claimed, 1) // the pending entry was reclaimed
    assert.equal(redelivered, true) // and actually re-processed
    assert.equal(await pendingCount(), 0) // success → acked → no longer pending
  })

  it('delivers jobs that were queued before the consumer group existed', async () => {
    await client.del(STREAM)
    await enqueueReview({ reviewId: 'r-before-worker', prUrl: 'https://github.com/o/r/pull/4' })
    await ensureGroup(client)

    const entry = await readOne('late-worker')

    assert.ok(entry, 'expected an entry queued before group creation to be delivered')
    await processEntry(client, entry.id, entry.fields, async (job) => {
      assert.equal(job.reviewId, 'r-before-worker')
    })
    assert.equal(await pendingCount(), 0)
  })

  it('keeps consuming after the stream and group are recreated', async () => {
    await client.del(STREAM)
    await ensureGroup(client)

    const controller = new AbortController()
    let loop!: Promise<void>
    const targetReviewId = 'r-after-recreate'
    const handled = new Promise<string>((resolve) => {
      loop = consumeReviews(
        async (job) => {
          if (job.reviewId !== targetReviewId) return
          resolve(job.reviewId)
          controller.abort()
        },
        { consumerName: 'recreated-group-worker', signal: controller.signal },
      )
    })

    await new Promise((resolve) => setTimeout(resolve, 25))
    await client.del(STREAM)
    await enqueueReview({ reviewId: targetReviewId, prUrl: 'https://github.com/o/r/pull/5' })

    assert.equal(await handled, targetReviewId)
    await loop
  })
})
