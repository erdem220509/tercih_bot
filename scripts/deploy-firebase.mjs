import { spawn } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase.js')
const ipv4DnsPreload = path.join(scriptDirectory, 'firebase-ipv4-dns.cjs')

let needsIpv4DnsWorkaround = false
try {
  const addresses = await lookup('cloudfunctions.googleapis.com', { all: true })
  const hasIpv4 = addresses.some(({ family }) => family === 4)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    await fetch('https://cloudfunctions.googleapis.com/', {
      method: 'HEAD',
      signal: controller.signal,
    })
    needsIpv4DnsWorkaround = !hasIpv4
  } catch {
    needsIpv4DnsWorkaround = true
  } finally {
    clearTimeout(timeout)
  }
} catch {
  needsIpv4DnsWorkaround = true
}

if (needsIpv4DnsWorkaround) {
  console.log('Using the Firebase IPv4 DNS workaround for this network.')
}

const nodeArguments = [
  ...(needsIpv4DnsWorkaround ? ['--require', ipv4DnsPreload] : []),
  firebaseCli,
  'deploy',
  '--only',
  'functions,hosting',
  '--non-interactive',
]

const child = spawn(process.execPath, nodeArguments, {
  cwd: path.join(scriptDirectory, '..'),
  env: {
    ...process.env,
    DEBUG: '',
  },
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(`Could not start Firebase deployment: ${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Firebase deployment stopped with signal ${signal}.`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
})
