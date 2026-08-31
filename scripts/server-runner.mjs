import { spawn } from 'node:child_process'
import fs from 'node:fs'
const readEnv = () => fs.existsSync('.env') ? Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#') && x.includes('=')).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)] })) : {}
const run = () => { const child = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: { ...process.env, ...readEnv() } }); child.on('exit', code => code === 75 ? setTimeout(run, 500) : process.exit(code || 0)) }
run()
