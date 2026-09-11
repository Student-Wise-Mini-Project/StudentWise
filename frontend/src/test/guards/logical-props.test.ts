import { describe, expect, it } from 'vitest'

import { hits, sourceFiles } from './sourceFiles'

/**
 * RTL-readiness, made enforceable.
 *
 * The app is English today and right-to-left Hebrew later. Physical direction
 * utilities (`ml-`, `pr-`, `text-left`, `border-l`) silently survive a `dir`
 * flip and land the layout mirrored in exactly the wrong places. Logical
 * equivalents (`ms-`, `pe-`, `text-start`, `border-s`) flip with the document.
 *
 * Nobody on the team reads Hebrew while building this, so a review will not
 * catch these. A test will.
 */
const PHYSICAL: { bad: RegExp; use: string }[] = [
  { bad: /(?<![\w-])m[lr]-(?=[\w[])/, use: 'ms-* / me-*' },
  { bad: /(?<![\w-])p[lr]-(?=[\w[])/, use: 'ps-* / pe-*' },
  { bad: /(?<![\w-])(?:left|right)-(?=[\w[])/, use: 'start-* / end-*' },
  { bad: /(?<![\w-])text-(?:left|right)(?![\w-])/, use: 'text-start / text-end' },
  { bad: /(?<![\w-])border-[lr](?![\w-])/, use: 'border-s / border-e' },
  { bad: /(?<![\w-])rounded-[lr](?![\w-])/, use: 'rounded-s / rounded-e' },
  {
    bad: /(?<![\w-])(?:margin|padding)-(?:left|right)\s*:/,
    use: 'margin-inline-* / padding-inline-*',
  },
]

describe('RTL readiness', () => {
  const files = sourceFiles({
    extensions: ['.ts', '.tsx', '.css'],
    excludeDirs: ['test/guards'],
  })

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const rule of PHYSICAL) {
    it(`no physical direction utility matching ${rule.bad.source}`, () => {
      const offenders = files.flatMap((f) => hits(f.text, rule.bad).map((h) => `${f.path} ${h}`))
      expect(
        offenders,
        offenders.length ? `Use ${rule.use} instead — these do not flip for Hebrew.` : '',
      ).toEqual([])
    })
  }
})
