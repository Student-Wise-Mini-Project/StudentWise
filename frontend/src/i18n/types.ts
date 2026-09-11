/**
 * The i18n type surface.
 *
 * `MessageKey` is derived from the English catalogue rather than hand-written,
 * which is the whole reason this is not a library: a typo in a key and a Hebrew
 * string nobody wrote are both compile errors, and `tsc` already runs in CI.
 */
export const LOCALES = ['he', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/**
 * CLDR plural categories. Hebrew uses `one`, `two`, `many` and `other`; English
 * uses only `one` and `other`, so everything but `other` is optional.
 */
export type PluralForms = {
  one: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type Vars = Record<string, string | number>

/** A message is either a string or a set of plural forms. Nothing else. */
export type Message = string | PluralForms

/** True for the leaves of a catalogue -- a string, or a plural object. */
type IsLeaf<T> = T extends string ? true : T extends { other: string } ? true : false

/**
 * Dotted key paths into a catalogue, stopping at plural objects so
 * `{one, two, many, other}` is one key rather than four.
 */
export type Flatten<T, P extends string = ''> = {
  [K in keyof T & string]: IsLeaf<T[K]> extends true ? `${P}${K}` : Flatten<T[K], `${P}${K}.`>
}[keyof T & string]

/**
 * The same shape as the English catalogue with every leaf widened.
 *
 * This is what makes a missing Hebrew string a compile error: `he` is declared
 * as `Widen<typeof en>`, so it must carry exactly the English key set -- no
 * fewer, and no extras.
 */
export type Widen<T> = T extends string
  ? string
  : T extends { other: string }
    ? PluralForms
    : { [K in keyof T]: Widen<T[K]> }

/** A catalogue after flattening: dotted key to message. */
export type FlatCatalogue = Record<string, Message>
