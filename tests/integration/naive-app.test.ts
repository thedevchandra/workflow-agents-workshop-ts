delete process.env.DATABASE_URL

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../../packages/naive-agent/src/server.js'
import { installGithubStub, TEST_PR_URL } from '../helpers.js'

let restore: () => void
const app = createApp()

before(() => {
  restore = installGithubStub()
})
after(() => restore())

test('POST /api/reviews runs the review in-process and returns a verdict', async () => {
  const res = await app.fetch(
    new Request('http://test/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prUrl: TEST_PR_URL }),
    }),
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { id: string; verdict: string }
  assert.equal(body.verdict, 'approve')

  // It's persisted and visible in the viewer API.
  const detail = await app.fetch(new Request(`http://test/api/reviews/${body.id}`))
  const data = (await detail.json()) as {
    review: { status: string; verdict: string }
    findings: unknown[]
  }
  assert.equal(data.review.status, 'done')
  assert.equal(data.review.verdict, 'approve')
  assert.ok(data.findings.length >= 2)
})

test('POST /api/reviews validates the body', async () => {
  const res = await app.fetch(
    new Request('http://test/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
  assert.equal(res.status, 400)
})
