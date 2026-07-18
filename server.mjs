import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './functions/app.mjs'

const PORT = Number(process.env.PORT || 8787)

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Pusula API listening on http://localhost:${PORT}`)
  })
}

export * from './functions/app.mjs'
