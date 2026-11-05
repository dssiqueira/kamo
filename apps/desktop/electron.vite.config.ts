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
          // kamo-media: project thumbnails and videos (src/main/media.ts), nowhere else.
          "img-src 'self' data: blob: kamo-media:",
          "media-src 'self' blob: kamo-media:",
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
    // Build-time flags (src/main/build-flags.ts): set by CI and the release workflow only.
    define: {
      __KAMO_CI_SMOKE__: JSON.stringify(process.env['KAMO_BUILD_CI_SMOKE'] === '1'),
      __KAMO_MCP_ON_NPM__: JSON.stringify(process.env['KAMO_BUILD_MCP_ON_NPM'] === '1'),
    },
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
          editor: resolve(import.meta.dirname, 'src/renderer/editor.html'),
          // Hidden window that records the microphone and computer sound (F-04).
          'audio-recorder': resolve(import.meta.dirname, 'src/renderer/audio-recorder.html'),
          // Hidden window that records the webcam (A-03).
          'camera-recorder': resolve(import.meta.dirname, 'src/renderer/camera-recorder.html'),
          // Settings window (F-15) and first-run permissions onboarding (F-13).
          settings: resolve(import.meta.dirname, 'src/renderer/settings.html'),
          onboarding: resolve(import.meta.dirname, 'src/renderer/onboarding.html'),
          // Hidden window that decodes a voice track for local transcription (A-05).
          'transcribe-audio': resolve(import.meta.dirname, 'src/renderer/transcribe-audio.html'),
          // The selection frame (A-08 Select), and its border while recording.
          selection: resolve(import.meta.dirname, 'src/renderer/selection.html'),
        },
      },
    },
  },
})
