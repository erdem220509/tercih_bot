import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { app } from './app.mjs'

const openAIKey = defineSecret('OPENAI_API_KEY')

// Firebase Functions is always reached through Google's trusted proxy.
// This lets Express use the visitor address for the advisor rate limit.
app.set('trust proxy', 1)

export const api = onRequest(
  {
    region: 'europe-west3',
    timeoutSeconds: 90,
    memory: '512MiB',
    maxInstances: 3,
    secrets: [openAIKey],
  },
  app,
)
