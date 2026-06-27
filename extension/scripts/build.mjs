import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dist = resolve(root, 'dist')

mkdirSync(dist, { recursive: true })

async function run() {
  await esbuild.build({
    entryPoints: [resolve(root, 'src/background.ts'), resolve(root, 'src/content.ts')],
    bundle: true,
    outdir: dist,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: false,
    minify: true,
  })

  const manifest = readFileSync(resolve(root, 'public/manifest.json'), 'utf-8')
  writeFileSync(resolve(dist, 'manifest.json'), manifest)

  try {
    const iconsDir = resolve(dist, 'icons')
    mkdirSync(iconsDir, { recursive: true })
    copyFileSync(resolve(root, 'public/icons/16.png'), resolve(iconsDir, '16.png'))
    copyFileSync(resolve(root, 'public/icons/48.png'), resolve(iconsDir, '48.png'))
    copyFileSync(resolve(root, 'public/icons/128.png'), resolve(iconsDir, '128.png'))
  } catch {
  }

  console.log('Extension built to:', dist)
}

run().catch(console.error)
