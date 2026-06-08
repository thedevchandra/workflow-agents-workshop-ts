// Ensure the in-memory backend is selected.
delete process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addFinding,
  createReview,
  getFindings,
  getReview,
  getSpans,
  listReviews,
  setReviewResult,
  storeTracer,
} from '@workshop/db'

test('reviews: create, list, get, and update', async () => {
  const id = await createReview('https://github.com/o/r/pull/1')
  const created = await getReview(id)
  assert.equal(created?.status, 'running')
  assert.equal(created?.pr_url, 'https://github.com/o/r/pull/1')

  const list = await listReviews()
  assert.ok(list.some((r) => r.id === id))

  await setReviewResult(id, { status: 'done', verdict: 'approve', reason: 'ok' })
  const done = await getReview(id)
  assert.equal(done?.status, 'done')
  assert.equal(done?.verdict, 'approve')
})

test('findings attach to a review', async () => {
  const id = await createReview('https://github.com/o/r/pull/2')
  await addFinding(id, 'security', 'no issues')
  await addFinding(id, 'performance', 'looks fine')
  const findings = await getFindings(id)
  assert.equal(findings.length, 2)
  assert.deepEqual(
    findings.map((f) => f.agent),
    ['security', 'performance'],
  )
})

test('storeTracer records spans against a run id', async () => {
  const runId = await createReview('https://github.com/o/r/pull/3')
  const tracer = storeTracer()
  const spanId = globalThis.crypto.randomUUID()
  tracer.onStart({ spanId, runId, name: 'security', kind: 'agent' }, { in: 1 })
  tracer.onEnd({ spanId, runId, name: 'security', kind: 'agent' }, { ok: true, output: { out: 2 } })

  const spans = await getSpans(runId)
  assert.equal(spans.length, 1)
  assert.equal(spans[0]?.name, 'security')
  assert.equal(spans[0]?.status, 'ok')
})
