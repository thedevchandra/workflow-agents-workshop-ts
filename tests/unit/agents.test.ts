import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENTS,
  REVIEWERS,
  hasFrontendFiles,
  selectReviewers,
  securityReviewer,
  performanceReviewer,
  uxReviewer,
  judge,
} from '@workshop/agent'

const backendOnly = [{ file: 'src/api/users.ts', diff: 'x' }]
const withFrontend = [
  { file: 'src/api/users.ts', diff: 'x' },
  { file: 'src/ui/Button.tsx', diff: 'y' },
]

test('hasFrontendFiles detects frontend extensions', () => {
  assert.equal(hasFrontendFiles(backendOnly), false)
  assert.equal(hasFrontendFiles(withFrontend), true)
})

test('selectReviewers runs security + performance always', () => {
  const names = selectReviewers(backendOnly).map((a) => a.name)
  assert.deepEqual(names, ['security', 'performance'])
})

test('selectReviewers adds ux when the diff touches frontend', () => {
  const names = selectReviewers(withFrontend).map((a) => a.name)
  assert.deepEqual(names, ['security', 'performance', 'ux'])
})

test('REVIEWERS is the always-on pair; AGENTS holds all four', () => {
  assert.deepEqual(
    REVIEWERS.map((a) => a.name),
    ['security', 'performance'],
  )
  assert.deepEqual(Object.keys(AGENTS).sort(), ['judge', 'performance', 'security', 'ux'])
  assert.equal(securityReviewer.name, 'security')
  assert.equal(performanceReviewer.name, 'performance')
  assert.equal(uxReviewer.name, 'ux')
  assert.equal(judge.name, 'judge')
})
