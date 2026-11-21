const readonly = names => Object.fromEntries(names.split(/\s+/).map(name => [name, 'readonly']))

const shared = readonly('AbortController AbortSignal Blob console crypto DOMException Event fetch FormData Headers Intl queueMicrotask Request Response setInterval clearInterval setTimeout clearTimeout structuredClone TextEncoder URL URLSearchParams')
const browser = readonly('BroadcastChannel cancelAnimationFrame createImageBitmap CustomEvent document DOMParser Element File FileReader getComputedStyle HTMLElement HTMLImageElement Image IntersectionObserver localStorage MutationObserver navigator requestAnimationFrame ResizeObserver sessionStorage window XMLHttpRequest')

export default [
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', 'artifacts/**', 'better-getafe-uploads/**', 'data/**', '.npm-cache/**', '.vercel/**'] },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: shared,
    },
    rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
  },
  { files: ['src/**', 'apps/**', 'packages/**'], languageOptions: { globals: browser } },
  { files: ['server.js', 'eslint.config.js', '**/vite.config.js', 'scripts/**', 'server/**', 'services/**', 'packages/configuration/**'], languageOptions: { globals: readonly('Buffer process') } },
]
