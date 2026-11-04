import { defineProject } from 'vitest/config'

// Main-process code (storage, log) runs in Node; renderer tests can add a jsdom project later.
export default defineProject({
  test: {
    name: 'desktop',
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
  },
})
