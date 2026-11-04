import { defineProject } from 'vitest/config'

// Tests live in test/, outside src/, so the published package and the read-only source scan
// never see the helpers that build temporary projects folders.
export default defineProject({
  test: {
    name: 'mcp',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
