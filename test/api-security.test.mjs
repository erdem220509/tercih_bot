import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { app } from '../server.mjs'

async function withServer(context) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise((resolve) => server.close(resolve)))
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

test('API responses include defensive browser headers', async (context) => {
  const baseUrl = await withServer(context)
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
})

test('search rejects unbounded or unsupported filters before contacting upstream', async (context) => {
  const baseUrl = await withServer(context)
  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      programId: 1,
      scoreType: 'UNSUPPORTED',
      page: 999999,
    }),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { message: 'Invalid search filters.' })
})

test('net lookup rejects arbitrary years and program identifiers', async (context) => {
  const baseUrl = await withServer(context)
  const response = await fetch(`${baseUrl}/api/nets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year: 1900, programCode: '../unexpected' }),
  })

  assert.equal(response.status, 400)
})
