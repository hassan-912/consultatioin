/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '')
 const dataMode = mode === 'artifact' || mode === 'test' ? 'local' : env.VITE_DATA_MODE || (mode === 'production' ? 'supabase' : 'local')
 if (!['local', 'supabase'].includes(dataMode)) throw new Error('Unknown VITE_DATA_MODE')
 return ({
  define: { __DATA_MODE__: JSON.stringify(dataMode) },
  resolve: { alias: { '#data-repo': fileURLToPath(new URL(`./src/data/selected.${dataMode === 'supabase' ? 'supabase' : 'local'}.ts`, import.meta.url)) } },
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  build: mode === 'artifact' ? { outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, emptyOutDir: false } : { emptyOutDir: false },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})})
