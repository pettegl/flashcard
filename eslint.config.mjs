import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Container rules (AGENTS.md "Non-negotiables", DEVSPEC §II.3, NFR-06, NFR-10) enforced at lint time.
const restrictedGlobals = [
  { name: 'fetch', message: 'Use loadBinary()/loadJson(): fetch fails on file:// (CR§2.3).' },
  { name: 'caches', message: 'Cache Storage is allowed only in the http branch of loadBinary.ts.' },
  { name: 'WebSocket', message: 'No network at runtime (NFR-01).' },
  { name: 'EventSource', message: 'No network at runtime (NFR-01).' },
];

export default defineConfig([
  globalIgnores([
    'node_modules/',
    'dist/',
    'release/',
    'coverage/',
    'test-results/',
    'playwright-report/',
    'fixtures/',
    'content/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'no-console': ['error', { allow: ['warn'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'serviceWorker', message: 'Service Workers are forbidden (CR§3).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Content is rendered as text, never HTML (NFR-06).',
        },
      ],
    },
  },
  {
    files: ['src/platform/loadBinary.ts'],
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals.filter((g) => !['fetch', 'caches'].includes(g.name))],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.cjs', '*.mjs', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
]);
