#!/usr/bin/env node
/**
 * Fail if docs/roadmap.html disagrees with docs/roadmap.md.
 *
 * The published roadmap is the page people outside this repo actually look at,
 * and a status page that is quietly three weeks stale is worse than no status
 * page: it is confidently wrong. Keeping the two in step by remembering is the
 * same bet as keeping the API types in step by remembering, and that bet is
 * already a CI job here (`contract`). This is the same idea, three files
 * smaller.
 *
 * docs/roadmap.md is the source of truth. This never edits anything -- it says
 * what disagrees and exits 1.
 *
 *   node scripts/check-roadmap-sync.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const EMOJI = { '✅': 'done', '⬜': 'todo', '🔨': 'wip', '🚫': 'blocked' }

/** Mission id -> status, from the markdown tables. */
function fromMarkdown(text) {
  const statuses = new Map()
  for (const line of text.split('\n')) {
    const row = line.trim()
    // A mission row starts with its number: | 9.8 | ... | ✅ |
    if (!/^\|\s*\d+\.\d+\s*\|/.test(row)) continue
    const cells = row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const id = cells[0]
    const status = EMOJI[cells[cells.length - 1]]
    if (!status) {
      throw new Error(`roadmap.md: mission ${id} has no recognisable status emoji`)
    }
    statuses.set(id, status)
  }
  return statuses
}

/** Mission id -> status, from the EPICS array in the page. */
function fromHtml(text) {
  const statuses = new Map()
  // ["9.8", "Charts: ...", "L", "#3", "done"]
  const row = /\[\s*"(\d+\.\d+)"\s*,\s*"(?:[^"\\]|\\.)*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"(\w+)"\s*\]/g
  let match
  while ((match = row.exec(text)) !== null) {
    statuses.set(match[1], match[2])
  }
  return statuses
}

const md = fromMarkdown(readFileSync(join(root, 'docs/roadmap.md'), 'utf8'))
const html = fromHtml(readFileSync(join(root, 'docs/roadmap.html'), 'utf8'))

const problems = []

for (const [id, status] of md) {
  if (!html.has(id)) problems.push(`${id} is in roadmap.md but missing from roadmap.html`)
  else if (html.get(id) !== status) {
    problems.push(`${id} is "${status}" in roadmap.md but "${html.get(id)}" in roadmap.html`)
  }
}
for (const id of html.keys()) {
  if (!md.has(id)) problems.push(`${id} is in roadmap.html but not in roadmap.md`)
}

// The headline figure on the page is the one most likely to be left behind,
// because nothing about editing a single mission row forces you to revisit it.
const done = [...md.values()].filter((s) => s === 'done').length
const pageFigure = readFileSync(join(root, 'docs/roadmap.html'), 'utf8').match(
  /<dt>Missions done<\/dt><dd>(\d+)<small>\s*\/\s*(\d+)<\/small>/,
)
if (!pageFigure) {
  problems.push('roadmap.html has no "Missions done" figure to check')
} else {
  if (Number(pageFigure[1]) !== done) {
    problems.push(`"Missions done" says ${pageFigure[1]}; roadmap.md has ${done}`)
  }
  if (Number(pageFigure[2]) !== md.size) {
    problems.push(`"Missions done" is out of ${pageFigure[2]}; roadmap.md has ${md.size} missions`)
  }
}

if (problems.length > 0) {
  console.error('roadmap.html is out of step with roadmap.md:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nUpdate docs/roadmap.html, then republish it as the artifact.')
  process.exit(1)
}

console.log(`roadmap in sync: ${md.size} missions, ${done} done`)
