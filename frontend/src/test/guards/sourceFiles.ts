import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** Every source file under `src/`, as `{ path, text }`, excluding the listed dirs. */
export function sourceFiles(options: {
  extensions: string[]
  excludeDirs?: string[]
}): { path: string; text: string }[] {
  const exclude = new Set(options.excludeDirs ?? [])
  const out: { path: string; text: string }[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(SRC, full).split(sep).join('/')
      if (exclude.has(rel)) continue
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!options.extensions.some((ext) => entry.endsWith(ext))) continue
      out.push({ path: `src/${rel}`, text: readFileSync(full, 'utf8') })
    }
  }

  walk(SRC)
  return out
}

/**
 * Blank out comments, keeping line numbers intact.
 *
 * A comment cannot style anything, so scanning them produces only false
 * positives — the prose explaining *why* we avoid `right-` is not a use of
 * `right-`. Replacing with spaces rather than deleting keeps reported line
 * numbers honest.
 */
export function stripComments(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank) // /* ... */ and CSS comments
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)))
}

/** Every `line:match` hit for `pattern` in `text`, ignoring comments. */
export function hits(text: string, pattern: RegExp): string[] {
  const source = stripComments(text)
  const raw = text.split('\n')
  const found: string[] = []

  source.split('\n').forEach((line, i) => {
    const re = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g')
    for (const m of line.matchAll(re)) {
      found.push(`line ${i + 1}: ${m[0]}  ->  ${(raw[i] ?? '').trim().slice(0, 90)}`)
    }
  })
  return found
}
