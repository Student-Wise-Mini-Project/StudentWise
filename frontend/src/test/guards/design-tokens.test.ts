import { describe, expect, it } from 'vitest'

import { hits, sourceFiles } from './sourceFiles'

/**
 * The retheme promise, made enforceable.
 *
 * `src/styles/` is the only place in the app permitted to name a colour or a
 * typeface. Everything else styles through tokens. If this test fails, applying
 * a new design would mean editing screens instead of editing one file — which is
 * the exact outcome the structure exists to prevent.
 */
const FORBIDDEN: { name: string; pattern: RegExp; fix: string }[] = [
  {
    name: 'a hex colour',
    pattern: /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
    fix: 'add a token to src/styles/theme.css and use the generated utility',
  },
  {
    name: 'an rgb()/hsl()/oklch() literal',
    pattern: /\b(?:rgba?|hsla?|oklch|oklab)\s*\(/,
    fix: 'add a token to src/styles/theme.css',
  },
  {
    name: 'a font-family declaration',
    pattern: /font-family\s*:/,
    fix: 'use the font-display / font-body utilities',
  },
  {
    name: 'a Tailwind arbitrary colour class',
    pattern: /\b(?:bg|text|border|fill|stroke|ring|shadow|from|via|to)-\[(?:#|rgb|hsl|oklch)/,
    fix: 'add a token to src/styles/theme.css',
  },
]

describe('design tokens', () => {
  const files = sourceFiles({
    extensions: ['.ts', '.tsx', '.css'],
    excludeDirs: ['styles'],
  })

  it('finds source files to check (the guard itself is not silently empty)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const rule of FORBIDDEN) {
    it(`no file outside src/styles/ contains ${rule.name}`, () => {
      const offenders = files
        .filter((f) => !f.path.startsWith('src/test/guards/'))
        .flatMap((f) => hits(f.text, rule.pattern).map((h) => `${f.path} ${h}`))

      expect(
        offenders,
        offenders.length ? `Found ${rule.name}. Instead: ${rule.fix}.` : '',
      ).toEqual([])
    })
  }
})
