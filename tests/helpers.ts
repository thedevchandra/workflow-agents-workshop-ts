/**
 * Test helpers.
 *
 * The whole suite runs offline and deterministically:
 *   - AGENT_MODEL=mock forces the mock model client (no API keys, no LLM calls).
 *   - installGithubStub() intercepts GitHub PR file requests so prepareDiff
 *     returns fixed patches; everything else (e.g. localhost e2e requests)
 *     passes through to the real fetch.
 */

// Force the deterministic mock model unless a test opts out.
process.env.AGENT_MODEL ??= 'mock'

export interface FakeFile {
  filename: string
  patch?: string
  status?: string
}

/** A mixed diff: a backend file, a frontend file (triggers UX), and noise. */
export const DEFAULT_FILES: FakeFile[] = [
  {
    filename: 'src/api/users.ts',
    status: 'modified',
    patch: '@@ -1,3 +1,5 @@\n+export const limit = 100\n',
  },
  {
    filename: 'src/components/Button.tsx',
    status: 'modified',
    patch: '@@ -1,2 +1,4 @@\n+export const Button = () => null\n',
  },
  {
    filename: 'package-lock.json',
    status: 'modified',
    patch: '@@ -1 +1 @@\n+{ "noise": true }\n',
  },
]

/**
 * Replace global fetch with a stub that answers GitHub PR file requests from
 * `files` and passes all other requests through to the real fetch. Returns a
 * restore function.
 */
export function installGithubStub(files: FakeFile[] = DEFAULT_FILES): () => void {
  const original = globalThis.fetch
  const stub: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    if (url.includes('api.github.com')) {
      return new Response(JSON.stringify(files), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return original(input as Parameters<typeof fetch>[0], init)
  }
  globalThis.fetch = stub
  return () => {
    globalThis.fetch = original
  }
}

/** A valid public-looking PR URL for prepareDiff to parse. */
export const TEST_PR_URL = 'https://github.com/octocat/Hello-World/pull/1'

/** Poll an async predicate until it returns true or the timeout elapses. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 5000, intervalMs = 25 } = {},
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`)
}
