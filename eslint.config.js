import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

// AGENTS.md rule 1: core and ui do not know where they run.
const platformImports = {
  paths: [
    { name: 'electron', message: 'core and ui cannot depend on Electron (rule 1).' },
    { name: 'fs', message: 'Files come in through ProjectStore/FileSink (rule 1).' },
    { name: 'path', message: 'core and ui cannot use Node modules (rule 1).' },
    { name: 'os', message: 'core and ui cannot use Node modules (rule 1).' },
    { name: 'child_process', message: 'core and ui cannot use Node modules (rule 1).' },
  ],
  patterns: [
    { group: ['node:*'], message: 'core and ui cannot use Node modules (rule 1).' },
    { group: ['electron/*'], message: 'core and ui cannot depend on Electron (rule 1).' },
    {
      group: ['@supabase/*'],
      message: 'Only packages/cloud-client talks to the cloud (rule 5).',
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/out-*/**',
      '**/release/**',
      '**/generated/**',
      '**/coverage/**',
      // native helper build output (cargo, SwiftPM, whisper.cpp's source and CMake tree)
      'apps/desktop/native/*/build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['packages/core/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    // Tests run in Node and may read fixtures from disk.
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', platformImports],
      'no-restricted-globals': [
        'error',
        { name: 'chrome', message: 'No chrome.* in core and ui (rule 1).' },
        { name: 'process', message: 'No process in core and ui (rule 1).' },
        { name: 'require', message: 'No require in core and ui (rule 1).' },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    // core and ui already get this restriction above (a repeated rule would override the other)
    ignores: ['packages/cloud-client/**', 'packages/core/**', 'packages/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              message: 'Only packages/cloud-client talks to the cloud (rule 5).',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
