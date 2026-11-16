import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  root: directory,
  define: { 'import.meta.env.VITE_APP_SURFACE': JSON.stringify('public') },
  plugins: [react()],
  publicDir: path.resolve(directory, '../../public'),
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] },
  server: { fs: { allow: [path.resolve(directory, '../..')] } },
  build: { outDir: path.resolve(directory, '../../dist/apps/public-web'), emptyOutDir: true, sourcemap: false },
})
