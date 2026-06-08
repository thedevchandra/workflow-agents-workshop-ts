import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDecision } from '@workshop/agent'

test('parseDecision reads a clean JSON verdict', () => {
  const raw = JSON.stringify({
    verdict: 'request-changes',
    reason: 'SQL injection in users query',
    findings: [{ agent: 'security', severity: 'block', note: 'parameterize the query' }],
  })
  const d = parseDecision(raw)
  assert.equal(d.verdict, 'request-changes')
  assert.equal(d.reason, 'SQL injection in users query')
  assert.equal(d.findings.length, 1)
})

test('parseDecision extracts JSON embedded in prose', () => {
  const raw = 'Here is my decision:\n{"verdict":"approve","reason":"looks good"}\nThanks!'
  const d = parseDecision(raw)
  assert.equal(d.verdict, 'approve')
  assert.equal(d.reason, 'looks good')
})

test('parseDecision degrades gracefully on non-JSON', () => {
  const d = parseDecision('no json here')
  assert.equal(d.verdict, 'unknown')
  assert.equal(d.reason, 'no json here')
  assert.deepEqual(d.findings, [])
})
