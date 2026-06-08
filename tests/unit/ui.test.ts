delete process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUiRouter } from '@workshop/ui'
import { addFinding, createReview, setReviewResult } from '@workshop/db'

const app = createUiRouter('Test Viewer')

test('GET / serves the dashboard HTML with the title', async () => {
  const res = await app.fetch(new Request('http://test/'))
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Test Viewer/)
})

test('GET /api/reviews returns the reviews JSON', async () => {
  const id = await createReview('https://github.com/o/r/pull/10')
  const res = await app.fetch(new Request('http://test/api/reviews'))
  assert.equal(res.status, 200)
  const rows = (await res.json()) as Array<{ id: string }>
  assert.ok(rows.some((r) => r.id === id))
})

test('GET /api/reviews/:id returns review + findings', async () => {
  const id = await createReview('https://github.com/o/r/pull/11')
  await addFinding(id, 'security', 'looks fine')
  await setReviewResult(id, { status: 'done', verdict: 'approve' })

  const res = await app.fetch(new Request(`http://test/api/reviews/${id}`))
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    review: { verdict: string }
    findings: unknown[]
    spans: unknown[]
  }
  assert.equal(body.review.verdict, 'approve')
  assert.equal(body.findings.length, 1)
})

test('GET /api/reviews/:id returns 404 for an unknown id', async () => {
  const res = await app.fetch(new Request('http://test/api/reviews/does-not-exist'))
  assert.equal(res.status, 404)
})
