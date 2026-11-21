import http from 'node:http'
import https from 'node:https'

const baseUrl = new URL(process.env.DEPLOYMENT_URL || 'http://127.0.0.1:8080')
const timeoutMs = Number(process.env.DEPLOYMENT_TIMEOUT_MS || 5000)
const attempts = Number(process.env.DEPLOYMENT_RETRIES || 12)
if (!Number.isSafeInteger(attempts) || attempts < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
  throw new Error('Deployment retries and timeout must be positive integers.')
}

const checks = [
  { name: 'proxy health', path: '/healthz', host: 'public.getafe.local', matches: body => body.trim() === 'ok' },
  ...[
    ['public.getafe.local', 'Municipality of Getafe'],
    ['resident.getafe.local', 'Getafe Resident Portal'],
    ['admin.getafe.local', 'Getafe Administration'],
  ].map(([host, title]) => ({ name: title, path: '/', host, matches: body => body.includes('<title>' + title + '</title>') })),
  { name: 'API v1 readiness', path: '/api/v1/ready', host: 'public.getafe.local', matches: body => {
    const state = JSON.parse(body)
    return state.ready === true && state.service === 'better-getafe'
  } },
]

async function check({ name, path, host, matches }) {
  const transport = baseUrl.protocol === 'https:' ? https : http
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        transport.get(new URL(path, baseUrl), { headers: { Host: host }, signal: AbortSignal.timeout(timeoutMs) }, resolve).once('error', reject)
      })
      let body = ''
      response.setEncoding('utf8')
      for await (const chunk of response) {
        body += chunk
        if (body.length > 256 * 1024) throw new Error('Unexpectedly large smoke-check response')
      }
      if (response.statusCode !== 200 || !matches(body)) throw new Error('Unexpected response from ' + host + ' (HTTP ' + response.statusCode + ')')
      console.info('[Deploy] ' + name + ' passed.')
      return
    } catch (error) {
      if (attempt === attempts) throw new Error(name + ' failed after ' + attempts + ' attempt(s).', { cause: error })
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, attempt * 100)))
    }
  }
}

for (const item of checks) await check(item)
