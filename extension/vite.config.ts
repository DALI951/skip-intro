import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(__dirname, 'src/entrypoints/popup'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/popup'),
    emptyOutDir: true,
  },
})
