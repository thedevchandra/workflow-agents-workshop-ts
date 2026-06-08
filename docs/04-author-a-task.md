# 04 — Author a task (the hands-on finale)

> This is the half where coding agents come out. Point yours at the `YOUR TURN`
> block below and let it build on the task — the API is small enough that an agent
> reasons about it trivially. (In Session 1 you hand-wrote the worker's acks; here
> the goal is to feel how agent-native this is.)

## Anatomy of a task

```ts
import { task } from "@renderinc/sdk/workflows";

export default task(
  {
    name: "quick-review",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 },
  },
  async function quickReview(input) {
    // ...your logic...
  },
);
```

That's the whole API surface:

- **A config object** — `name`, `timeoutSeconds`, `retry` (maxRetries / backoff),
  optional `plan` (compute size).
- **A function** — any `async (input) => result`.

Three things you get for free, that `worker-agents/src/kv.ts` had to build by hand:

| You write | Render gives you |
| --- | --- |
| `retry: { maxRetries: 2, … }` | automatic retries with backoff, in a fresh instance |
| `await someTask({ input })` | isolation — each task runs in its own container |
| nothing | a full trace of every task + sub-task run |

And **composition is just function calls**: call a task from inside a task; wrap
them in `Promise.all` to fan out. A *deterministic step* (pure logic) is just a
plain function — no `task()` needed.

## Your turn

Open [`packages/workflow-agents/src/workflows/quick-review/index.ts`](../packages/workflow-agents/src/workflows/quick-review/index.ts).
It's already a working task. You'll extend it to compose an agent as its own task.

### 1. Run what's there

```sh
cd packages/workflow-agents
cp .env.example .env
npm install            # from repo root if first time
npm run dev:workflows  # terminal A
```

In terminal B:

```sh
render workflows tasks list --local
# choose quick-review → run → input: { "url": "https://github.com/<owner>/<repo>/pull/<n>" }
```

You just authored and ran a task. Note: you never registered it anywhere —
`loader.ts` discovered it because the folder exists and exports a task.

### 2. Compose an agent as a task

Fill in the `YOUR TURN` block so the workflow also runs the security reviewer **as
its own task** and returns its findings:

```ts
import { securityReviewer } from "@workshop/agent";
import { agentTask } from "../../agentTask.js";

const securityTask = agentTask(securityReviewer);

// inside quickReview, after `summary`:
const meta = input._runId ? { _runId: input._runId } : {};
const review = await securityTask({ input: { patches }, ...meta });
return { summary, review: review.text };
```

Re-run. In the Render Dashboard trace (or the `render workflows dev` output)
you'll see `quick-review` with a nested `security` agent task, its LLM turns, and
token usage.

### 3. See the power: force a retry

Temporarily throw at the top of the task body:

```ts
if (Math.random() < 0.5) throw new Error("flaky!");
```

Re-run a few times and watch Render retry in a fresh instance per your `retry`
config — no try/catch, no queue, no dead-letter logic. Remove it when done.

### 4. Bonus — fan out

Swap the single reviewer for both, in parallel:

```ts
import { REVIEWERS } from "@workshop/agent";
const reviewerTasks = REVIEWERS.map(agentTask);
const reviews = await Promise.all(
  reviewerTasks.map((run) => run({ input: { patches }, ...meta })),
);
```

That's the same fan-out as the built-in `code-review` workflow — compare your file
to [`code-review/index.ts`](../packages/workflow-agents/src/workflows/code-review/index.ts).

## The takeaway

You added durable, retried, isolated, traced, parallel execution by writing a
plain function and a config object. In worker-agents that same set of guarantees took
a queue, a consumer group, acks, retries, and a pub/sub bus — all code you had to
own and debug. That is the whole arc of the workshop: the agent never changed;
the substrate did all the work.
