import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  matchPullRequest,
  verifyGithubSignature,
} from '../../packages/workflow-agents/src/github.js'

test('verifyGithubSignature accepts any request when no secret is set', () => {
  delete process.env.GITHUB_WEBHOOK_SECRET
  assert.equal(verifyGithubSignature('{}', {}), true)
})

test('verifyGithubSignature checks the HMAC when a secret is set', () => {
  process.env.GITHUB_WEBHOOK_SECRET = 'shhh'
  const body = '{"hello":"world"}'
  const sig = `sha256=${createHmac('sha256', 'shhh').update(body).digest('hex')}`
  assert.equal(verifyGithubSignature(body, { 'x-hub-signature-256': sig }), true)
  assert.equal(verifyGithubSignature(body, { 'x-hub-signature-256': 'sha256=bad' }), false)
  assert.equal(verifyGithubSignature(body, {}), false)
  delete process.env.GITHUB_WEBHOOK_SECRET
})

test('matchPullRequest projects a reviewable PR event', () => {
  const matched = matchPullRequest(
    {
      action: 'opened',
      pull_request: { html_url: 'https://github.com/o/r/pull/7', labels: [{ name: 'bug' }] },
    },
    { 'x-github-event': 'pull_request' },
  )
  assert.deepEqual(matched, { url: 'https://github.com/o/r/pull/7', labels: ['bug'] })
})

test('matchPullRequest ignores non-PR events and unsupported actions', () => {
  assert.equal(matchPullRequest({ action: 'opened' }, { 'x-github-event': 'push' }), null)
  assert.equal(
    matchPullRequest(
      { action: 'closed', pull_request: { html_url: 'x' } },
      { 'x-github-event': 'pull_request' },
    ),
    null,
  )
})
