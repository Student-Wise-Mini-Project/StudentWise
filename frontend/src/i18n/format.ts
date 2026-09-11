import type { FlatCatalogue, Locale, Message, PluralForms, Vars } from './types'

/** `{name}` becomes the value; an unfilled placeholder is left visible. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

export function isPluralForms(value: unknown): value is PluralForms {
  return (
    typeof value === 'object' && value !== null && typeof (value as PluralForms).other === 'string'
  )
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

function rulesFor(locale: Locale): Intl.PluralRules {
  const cached = pluralRules.get(locale)
  if (cached) return cached
  const made = new Intl.PluralRules(locale)
  pluralRules.set(locale, made)
  return made
}

/**
 * Pick the plural form for a count.
 *
 * Not a `count === 1` ternary, because Hebrew has a distinct `two` category:
 * "2 expenses" is not formed like "3 expenses", and nobody on this team would
 * notice the difference in review.
 */
export function selectPlural(forms: PluralForms, count: number, locale: Locale): string {
  const category = rulesFor(locale).select(count) as keyof PluralForms
  return forms[category] ?? forms.other
}

/** Resolve one key against a flattened catalogue. */
export function translate(
  catalogue: FlatCatalogue,
  key: string,
  vars: Vars | undefined,
  locale: Locale,
): string {
  const message: Message | undefined = catalogue[key]
  // A key absent at runtime cannot happen while the types hold; returning the
  // key rather than throwing means a bad merge degrades to a visible string
  // instead of a blank screen.
  if (message === undefined) return key
  if (typeof message === 'string') return interpolate(message, vars)

  const count = Number(vars?.count ?? 0)
  return interpolate(selectPlural(message, count, locale), vars)
}
