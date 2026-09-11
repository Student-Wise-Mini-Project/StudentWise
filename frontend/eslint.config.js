import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const STORAGE_MESSAGE =
  'Go through features/auth/authStore.ts. Storage access is the XSS surface for the access token, so it lives in exactly one file.'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'src/api/schema.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The token story depends on there being no second way to inject styles,
      // and the XSS surface of a localStorage token depends on this too.
      'react/no-danger': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'Never inject HTML. The auth token lives in localStorage, so an XSS here hands over every account.',
        },
      ],
      // `no-restricted-globals` alone does NOT catch `window.localStorage` --
      // only the bare identifier -- so both forms are banned explicitly.
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: STORAGE_MESSAGE },
        { name: 'sessionStorage', message: STORAGE_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: STORAGE_MESSAGE },
        { object: 'window', property: 'sessionStorage', message: STORAGE_MESSAGE },
        { object: 'globalThis', property: 'localStorage', message: STORAGE_MESSAGE },
      ],
    },
  },
  {
    // The one module allowed to touch storage: it *is* the seam.
    files: ['src/features/auth/authStore.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // Scripts and configs run in Node, not a browser.
    files: ['scripts/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
