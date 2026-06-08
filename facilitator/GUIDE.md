

```ts
export async function processEntry(
  client: Redis,
  id: string,
  fields: string[],
  handler: (job: ReviewJob) => Promise<void>,
): Promise<void> {
  const job = fieldsToJob(fields)
  try {
    if (job) await handler(job)
    await client.xack(STREAM, GROUP, id)
  } catch (err) {
    console.error('[kv] handler failed, leaving message un-acked for retry:', err)
  }
}
```