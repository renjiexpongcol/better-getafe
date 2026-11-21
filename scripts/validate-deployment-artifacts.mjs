import { existsSync, readFileSync } from 'node:fs'

const requiredFiles = [
  'docker-compose.apps.yml',
  'deploy/static-app/Dockerfile',
  'deploy/static-app/nginx.conf',
  'deploy/reverse-proxy/nginx.conf',
  'deploy/reverse-proxy/proxy_params',
]

const missingFiles = requiredFiles.filter(file => !existsSync(file))
if (missingFiles.length) throw new Error(`Missing deployment artifacts: ${missingFiles.join(', ')}`)

const compose = readFileSync('docker-compose.apps.yml', 'utf8')
for (const service of ['api:', 'public-web:', 'resident-app:', 'admin-portal:', 'reverse-proxy:']) {
  if (!compose.includes(`  ${service}`)) throw new Error(`Deployment compose is missing ${service}`)
}

const proxy = readFileSync('deploy/reverse-proxy/nginx.conf', 'utf8')
for (const upstream of ['getafe_api', 'getafe_public', 'getafe_resident', 'getafe_admin']) {
  if (!proxy.includes(`upstream ${upstream}`)) throw new Error(`Reverse proxy is missing ${upstream}`)
}

for (const directory of ['dist/apps/public-web', 'dist/apps/resident-app', 'dist/apps/admin-portal']) {
  const html = readFileSync(`${directory}/index.html`, 'utf8')
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])
  if (!assets.some(asset => asset.endsWith('.js'))) throw new Error(`No application entry script in ${directory}/index.html`)
  for (const asset of assets) {
    if (!existsSync(directory + asset)) throw new Error(`Missing build asset: ${directory}${asset}`)
  }
}

console.info('[Deploy] Independent app outputs and reverse-proxy artifacts are ready.')
