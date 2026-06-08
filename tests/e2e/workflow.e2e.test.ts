delete process.env.DATABASE_URL
process.env.RENDER_USE_LOCAL_DEV = 'true'

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { serve } from '@hono/node-server'
import { createApp } from '../../packages/workflow-agents/src/server.js'
import { installGithubStub, TEST_PR_URL, waitFor } from '../helpers.js'

let server: ReturnType<typeof serve>
let baseUrl: string
let restore: () => void

before(async () => {
  restore = installGithubStub()
  const app = await createApp()
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(info.port))
  })
  baseUrl = `http://localhost:${port}`
})

after(() => {
  server.close()
  restore()
})

test('e2e: submit a review and watch it settle over real HTTP', async () => {
  const post = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prUrl: TEST_PR_URL }),
  })
  assert.equal(post.status, 202)
  const { id } = (await post.json()) as { id: string }

  let verdict: string | undefined
  await waitFor(async () => {
    const detail = await fetch(`${baseUrl}/api/reviews/${id}`)
    const data = (await detail.json()) as { review: { status: string; verdict: string } }
    verdict = data.review.verdict
    return data.review.status !== 'running'
  })
  assert.equal(verdict, 'approve')
})
