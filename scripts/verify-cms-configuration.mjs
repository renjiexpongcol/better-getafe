import 'dotenv/config'

const required = (name) => {
  if (!process.env[name] || process.env[name].startsWith('your-') || process.env[name].includes('replace-with')) throw new Error(`Missing required PostgreSQL setting: ${name}`)
}

if ((process.env.DB_PROVIDER || 'postgresql') !== 'postgresql') throw new Error('DB_PROVIDER must be postgresql.')
for (const name of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']) required(name)
if (!process.env.DB_PASSWORD && !process.env.DATABASE_URL) throw new Error('Set DB_PASSWORD or DATABASE_URL.')
console.log(`PostgreSQL configuration present for ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}.`)
