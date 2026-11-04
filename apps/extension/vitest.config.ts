import { defineProject } from 'vitest/config'

// Pure logic only (manifest, locales, sizes, storage rules); the Chrome APIs are not mocked.
export default defineProject({
  test: {
    name: 'extension',
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
