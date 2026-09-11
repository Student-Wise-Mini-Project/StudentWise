import { describe, expect, it } from 'vitest'

import { sourceFiles, stripComments } from './sourceFiles'

/**
 * Translation, made enforceable.
 *
 * The app is Hebrew and English. A hardcoded English string does not crash and
 * does not fail a type check -- it just sits there in the middle of a Hebrew
 * screen, and only somebody reading Hebrew would notice. Nobody on this team is
 * doing that while building, which is the same reason `logical-props.test.ts`
 * exists.
 *
 * Two shapes are checked: text between JSX tags, and the props that carry text
 * to the user. `aria-label` is on that list because an accessible name is
 * user-visible -- a Hebrew screen reader announcing "Close" is the same bug as
 * an English button.
 */
const TEXT_PROPS = [
  'title',
  'label',
  'subtitle',
  'placeholder',
  'body',
  'empty',
  'header',
  'hint',
  'description',
  'eyebrow',
  'caption',
  'alt',
  'aria-label',
]

/**
 * Prose, not an identifier.
 *
 * Two or more Latin words, or one capitalised word. `SHARED_APARTMENT` is not
 * prose, `rounded-md` is not prose, `Cancel` is.
 */
const PROSE = /^(?:[A-Z][a-z]+|[A-Za-z]+(?:[ ,'—-]+[A-Za-z]+)+)[.?!]?$/

const PROP_PATTERN = new RegExp(`(?:${TEXT_PROPS.join('|')})=(?:"([^"]*)"|\\{'([^']*)'\\})`, 'g')

/** `>Some words<` on one line, with no braces in between. */
const JSX_TEXT = />([A-Za-z][^<>{}]*)</g

/**
 * JSX text on a line of its own, which is how prettier formats anything inside a
 * multi-line element:
 *
 *     <Button size="sm" onClick={dismiss}>
 *       Got it
 *     </Button>
 *
 * `JSX_TEXT` cannot see that -- the `>` and the `<` are on different lines -- and
 * it is the commonest shape a button label takes, so it needs its own check.
 * Anything carrying code punctuation is excluded, which is what keeps a chained
 * call or a type union from matching.
 */
const OWN_LINE = /^[A-Za-z][A-Za-z ,'’—-]*[.?!]?$/

/**
 * A statement, not a sentence.
 *
 * `return null` is two Latin words on a line of its own and reads as prose to
 * `OWN_LINE`. Keywords are the whole difference, so they are the whole check.
 */
const STATEMENT =
  /^(?:return|else|default|break|continue|await|async|const|let|var|import|export|function|new|typeof|void|delete|yield|throw|case|do|if|for|while|switch|try|catch|finally|in|of|as|from|true|false|null|undefined)\b/

describe('no bare strings', () => {
  const files = sourceFiles({
    extensions: ['.tsx'],
    excludeDirs: ['test', 'dev', 'i18n'],
  }).filter((file) => !file.path.endsWith('.test.tsx'))

  it('finds source files to check (the guard itself is not silently empty)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no user-visible string is written in a component instead of a catalogue', () => {
    const offenders: string[] = []

    for (const file of files) {
      stripComments(file.text)
        .split('\n')
        .forEach((line, index) => {
          const report = (text: string) => {
            if (text && PROSE.test(text)) {
              offenders.push(`${file.path} line ${index + 1}: "${text}"`)
            }
          }

          for (const pattern of [PROP_PATTERN, JSX_TEXT]) {
            for (const match of line.matchAll(new RegExp(pattern.source, 'g'))) {
              report((match[1] ?? match[2] ?? '').trim())
            }
          }

          const bare = line.trim()
          if (OWN_LINE.test(bare) && !STATEMENT.test(bare)) report(bare)
        })
    }

    expect(
      offenders,
      offenders.length ? 'Move these into src/i18n/messages/ and render with t().' : '',
    ).toEqual([])
  })
})
