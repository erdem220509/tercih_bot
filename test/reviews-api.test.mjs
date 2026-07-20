import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { app } from '../server.mjs'

test('a refreshed review summary bypasses stale browser caches', async (context) => {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise((resolve) => server.close(resolve)))

  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  const university = `Refresh Test University ${randomUUID()}`
  const response = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      university,
      programCode: '123456',
      clientId: randomUUID(),
      ratings: {
        dorms: 4,
        professors: 5,
        campus: 4,
        socialLife: 3,
      },
    }),
  })
  assert.equal(response.status, 201)

  const refreshed = await fetch(
    `${baseUrl}/api/reviews?university=${encodeURIComponent(university)}`,
    { cache: 'no-store' },
  )
  assert.match(refreshed.headers.get('cache-control'), /no-store/)
  assert.equal((await refreshed.json()).count, 1)
})
