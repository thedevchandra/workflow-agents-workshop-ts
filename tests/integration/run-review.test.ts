import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { runReview } from '@workshop/agent'
import { installGithubStub, TEST_PR_URL, DEFAULT_FILES } from '../helpers.js'

let restore: () => void

before(() => {
  restore = installGithubStub()
})
after(() => restore())

test('runReview wires prepareDiff → filterDiff → reviewers → judge (mock model)', async () => {
  const result = await runReview(TEST_PR_URL)

  // Noise (package-lock.json) is filtered out before review.
  assert.equal(result.patches.length, 2)
  assert.ok(!result.patches.some((p) => p.file === 'package-lock.json'))

  // The diff has a .tsx file, so UX joins security + performance.
  assert.deepEqual(
    result.reviews.map((r) => r.agent).sort(),
    ['performance', 'security', 'ux'],
  )

  // The mock judge approves.
  assert.equal(result.decision.verdict, 'approve')
})

test('runReview without frontend files skips the UX reviewer', async () => {
  restore()
  restore = installGithubStub([
    { filename: 'src/server.ts', status: 'modified', patch: '@@ -1 +1 @@\n+x\n' },
  ])
  const result = await runReview(TEST_PR_URL)
  assert.deepEqual(
    result.reviews.map((r) => r.agent).sort(),
    ['performance', 'security'],
  )
  // restore default stub for any later tests
  restore()
  restore = installGithubStub(DEFAULT_FILES)
})
