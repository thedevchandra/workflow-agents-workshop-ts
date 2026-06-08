import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveClient, resolveModelSpec } from '@workshop/agent'
import type { CompleteArgs } from '@workshop/agent'

test('resolveModelSpec maps tiers and infers providers', () => {
  assert.equal(resolveModelSpec('medium').provider, 'anthropic')
  assert.equal(resolveModelSpec().model, resolveModelSpec('medium').model) // default = medium
  assert.equal(resolveModelSpec('gpt-4o').provider, 'openai')
  assert.equal(resolveModelSpec('claude-sonnet-4-6').provider, 'anthropic')
})

function args(system: string): CompleteArgs {
  return {
    model: { provider: 'mock', model: 'mock' },
    system,
    tools: [],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    signal: new AbortController().signal,
  }
}

test('mock client returns a JSON verdict for the judge', async () => {
  const client = resolveClient({ provider: 'mock', model: 'mock' })
  const res = await client.complete(args('# Judge\nYou decide.'))
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const parsed = JSON.parse(text)
  assert.equal(parsed.verdict, 'approve')
})

test('mock client returns a finding for a reviewer', async () => {
  const client = resolveClient({ provider: 'mock', model: 'mock' })
  const res = await client.complete(args('# Security reviewer'))
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  assert.match(text, /severity/)
})
