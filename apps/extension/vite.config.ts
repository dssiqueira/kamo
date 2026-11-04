import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { LOCALES, loadMessages } from '@kamo/i18n'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { SERVICE_WORKER, buildManifest, chromeLocale, chromeMessages } from './scripts/manifest.ts'

const root = resolve(import.meta.dirname, 'src')
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'))

/** Writes manifest.json and _locales/<lang>/messages.json next to the built pages. */
function extensionManifest(): Plugin {
  return {
    name: 'kamo:extension-manifest',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(buildManifest(version), null, 2)}\n`,
      })
      const english = await loadMessages('en')
      for (const locale of LOCALES) {
        this.emitFile({
          type: 'asset',
          fileName: `_locales/${chromeLocale(locale)}/messages.json`,
          source: `${JSON.stringify(chromeMessages(await loadMessages(locale), english), null, 2)}\n`,
        })
      }
    },
  }
}

// `pnpm --filter extension dev` rebuilds on every change (load dist/ in chrome://extensions and
// press reload); a Vite dev server can't serve an MV3 extension's service worker or pages.
export default defineConfig(({ mode }) => {
  const dev = mode === 'development'
  return {
    root,
    base: './',
    publicDir: resolve(import.meta.dirname, 'public'),
    plugins: [react(), tailwindcss(), extensionManifest()],
    worker: { format: 'es' },
    build: {
      outDir: resolve(import.meta.dirname, 'dist'),
      emptyOutDir: true,
      minify: !dev,
      sourcemap: dev,
      // Extension pages load from disk; no preload polyfill or hints needed.
      modulePreload: false,
      rolldownOptions: {
        input: {
          // Popup: ≤ 150KB, no engine (docs/integrations.md → bundles per entry point).
          popup: resolve(root, 'popup.html'),
          // Hidden recorder: capture, thumbnails and the project files.
          offscreen: resolve(root, 'offscreen.html'),
          // Asks for the microphone on a visible page (E-01).
          microphone: resolve(root, 'microphone.html'),
          'service-worker': resolve(root, 'background/service-worker.ts'),
        },
        output: {
          // The manifest points to a fixed service worker name.
          entryFileNames: (chunk) =>
            chunk.name === 'service-worker' ? SERVICE_WORKER : 'assets/[name]-[hash].js',
        },
      },
    },
  }
})
