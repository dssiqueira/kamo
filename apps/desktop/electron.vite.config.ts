import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * Fills the renderer Content-Security-Policy (%KAMO_CSP% in index.html). The app makes no
 * network calls, so production only allows its own files. Dev adds what the Vite dev server
 * needs: the inline React Refresh preamble, injected <style> tags and the HMR websocket.
 */
function contentSecurityPolicy(): Plugin {
  let dev = false
  return {
    name: 'kamo:csp',
    configResolved(config) {
      dev = config.command === 'serve'
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const directives = [
          "default-src 'none'",
          dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
          dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
          "font-src 'self'",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
          "base-uri 'none'",
          "form-action 'none'",
          "object-src 'none'",
        ]
        return html.replace('%KAMO_CSP%', directives.join('; '))
      },
    },
  }
}

/**
 * Dev only: Vite serves `.json` imports as JS modules but keeps the `with { type: 'json' }`
 * attribute, which makes the browser reject them. @kamo/i18n needs the attribute for Node
 * (`check-keys`), so it is dropped here. The production build (Rolldown) already handles it.
 */
function stripJsonImportAttributes(): Plugin {
  const attribute = /,\s*\{\s*with:\s*\{\s*type:\s*["']json["']\s*\}\s*\}/g
  return {
    name: 'kamo:strip-json-import-attributes',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('/node_modules/') || !attribute.test(code)) return null
      attribute.lastIndex = 0
      return { code: code.replace(attribute, ''), map: null }
    },
  }
}

export default defineConfig({
  main: {
    build: {
      // Everything is bundled: the packaged app ships no node_modules.
      externalizeDeps: false,
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        // Sandboxed preloads cannot be ES modules.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(), stripJsonImportAttributes()],
    build: {
      rolldownOptions: {
        // One page per window kind (src/main/windows.ts).
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          countdown: resolve(import.meta.dirname, 'src/renderer/countdown.html'),
          'recording-bar': resolve(import.meta.dirname, 'src/renderer/recording-bar.html'),
        },
      },
    },
  },
})
