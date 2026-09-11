/**
 * Find the element that is making the page wider than the phone.
 *
 * Horizontal overflow is the one layout bug that is invisible on the machine it
 * was written on: a 1440px desktop window has room to spare, so a row that is
 * 40px too wide only shows up on the 390px screen it was designed for. And the
 * symptom -- "I have to pinch out to see the whole page" -- names the page, not
 * the element, because every ancestor of the offender is too wide too.
 *
 * So rather than reading CSS and guessing, this asks the browser. It walks the
 * rendered tree and reports the elements that stick out past the viewport,
 * skipping any whose parent already sticks out by the same amount -- those are
 * passengers, not causes. What is left is the actual culprit.
 *
 * Dev only, and only with the debug console on (`?debug`), so it costs a
 * production build nothing and a normal dev session nothing either.
 */

/** A short, readable path to an element: `div.feed > span.amount`. */
function describe(element: Element): string {
  const parts: string[] = []
  let node: Element | null = element

  for (let depth = 0; node && depth < 4; depth += 1) {
    const tag = node.tagName.toLowerCase()
    // The first couple of classes are usually enough to recognise it, and the
    // whole Tailwind string is unreadable in a 390px-wide console.
    const classes = Array.from(node.classList).slice(0, 3).join('.')
    parts.unshift(classes ? `${tag}.${classes}` : tag)
    node = node.parentElement
  }
  return parts.join(' > ')
}

export type Overflow = { element: Element; overhang: number; width: number; path: string }

/**
 * Every element wider than the viewport, innermost first.
 *
 * `documentElement.clientWidth` rather than `innerWidth`: the former excludes a
 * scrollbar, which is what a layout actually has to fit inside.
 */
export function findOverflow(root: ParentNode = document.body): Overflow[] {
  const limit = document.documentElement.clientWidth
  const found: Overflow[] = []

  for (const element of root.querySelectorAll('*')) {
    const box = element.getBoundingClientRect()
    if (box.width === 0) continue

    // A tolerance of 1px, because subpixel rounding routinely puts a
    // full-bleed element a fraction over and that is not a bug.
    const overhang = Math.max(box.right - limit, -box.left, 0)
    if (overhang <= 1) continue

    found.push({ element, overhang, width: box.width, path: describe(element) })
  }

  // An offender drags every ancestor out with it, so report the innermost
  // element at each overhang and drop the ones merely containing it.
  return found
    .filter(
      (candidate) =>
        !found.some(
          (other) =>
            other !== candidate &&
            candidate.element.contains(other.element) &&
            other.overhang >= candidate.overhang - 1,
        ),
    )
    .sort((a, b) => b.overhang - a.overhang)
}

/** Report once the page has settled, and again whenever it changes shape. */
export function startOverflowProbe(): void {
  const report = () => {
    const offenders = findOverflow()
    const limit = document.documentElement.clientWidth

    if (offenders.length === 0) {
      console.info(`Layout fits ${limit}px — no horizontal overflow.`)
      return
    }

    console.warn(
      `%cHorizontal overflow: ${offenders.length} element(s) stick out past ${limit}px.`,
      'font-weight:bold',
    )
    for (const { path, width, overhang, element } of offenders.slice(0, 8)) {
      console.warn(`  +${Math.round(overhang)}px  (${Math.round(width)}px wide)  ${path}`, element)
    }
  }

  // Two frames after load: one for layout, one for the webfont swap, which is
  // what actually changes the width of an amount.
  const settle = () => requestAnimationFrame(() => requestAnimationFrame(report))

  if (document.readyState === 'complete') settle()
  else window.addEventListener('load', settle, { once: true })

  document.fonts?.ready.then(settle)
  window.addEventListener('resize', settle)

  // Route changes do not reload, and each screen has its own layout to get
  // wrong, so re-check whenever the body subtree settles.
  let pending = 0
  new MutationObserver(() => {
    window.clearTimeout(pending)
    pending = window.setTimeout(report, 400)
  }).observe(document.body, { childList: true, subtree: true })
}
