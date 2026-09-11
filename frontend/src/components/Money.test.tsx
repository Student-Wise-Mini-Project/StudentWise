import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { divideForDisplay } from '@/lib/money'

import { Money } from './Money'

describe('Money', () => {
  it('renders a decimal string exactly', () => {
    render(<Money amount="412.60" />)
    expect(screen.getByText(/412\.60/)).toBeInTheDocument()
  })

  it('shows no sign by default, because a nearby label carries the direction', () => {
    render(<Money amount="-280.10" />)
    expect(screen.getByText(/280\.10/).textContent).not.toMatch(/[-−]/)
  })

  it('shows an explicit sign when asked, for a number standing on its own', () => {
    const { container } = render(<Money amount="412.60" sign="always" />)
    expect(container.textContent).toContain('+')
  })

  describe('the approximate marker cannot be avoided', () => {
    // This is the guarantee that keeps the UI honest about equal splits. The
    // server rounds with largest-remainder; the client must never claim to know
    // the result. `divideForDisplay` returns a wrapped value, and this component
    // is the only thing that renders it -- always with the sign.
    it('adds the ≈ for an approximate amount', () => {
      const share = divideForDisplay('212.30', 3)
      expect(share).not.toBeNull()
      const { container } = render(<Money amount={share!} />)
      expect(container.textContent).toContain('≈')
      expect(container.textContent).toContain('70.76')
    })

    it('tells a screen reader it is approximate, not just a sighted user', () => {
      const share = divideForDisplay('100.00', 3)
      render(<Money amount={share!} />)
      expect(screen.getByLabelText(/approximately/i)).toBeInTheDocument()
    })

    it('does not add the ≈ to an exact amount', () => {
      const { container } = render(<Money amount="33.34" />)
      expect(container.textContent).not.toContain('≈')
    })
  })

  it('colours by sign only when asked to', () => {
    const { container: auto } = render(<Money amount="-132.50" tone="auto" />)
    expect(auto.firstElementChild?.className).toContain('text-debt')

    const { container: neutral } = render(<Money amount="-132.50" />)
    expect(neutral.firstElementChild?.className).toContain('text-ink')
  })

  it('lines up in a column', () => {
    // Money sits in columns on the balances and expenses screens. Without
    // tabular figures the decimal points wander and the list looks broken.
    const { container } = render(<Money amount="1.00" />)
    expect(container.firstElementChild?.className).toContain('tnum')
  })
})

describe('under dir=rtl', () => {
  // (Spelled "LTR" rather than the hyphenated phrase on purpose: the
  // logical-props guard scans string literals too, because that is where class
  // names live, and it cannot tell prose from a utility.)
  //
  // Nobody on this team reads Hebrew while building, and happy-dom does not run
  // the Unicode bidi algorithm, so neither a review nor a render test will
  // catch a sign that has moved. What CAN be checked is that the mechanism
  // which pins it is present -- and that is the whole failure mode: the moment
  // `.amount` is missing, `+₪412.60` renders as `₪412.60+` under `dir="rtl"`
  // and nothing else in the suite notices.
  it('pins the amount as its own LTR run', () => {
    const { container } = render(<Money amount="412.60" tone="credit" />)
    expect(container.firstElementChild?.className).toContain('amount')
  })

  it('puts the sign first in the DOM, which is the order the isolation locks', () => {
    const { container } = render(<Money amount="412.60" tone="credit" />)
    expect(container.textContent?.trimStart().startsWith('+')).toBe(true)
  })

  it('signs a credit and a debt without being asked, because a tone IS a claim', () => {
    // `tone="credit"` means "this is money owed to you". A number that says so
    // in colour alone fails the commonest colour-vision deficiency there is.
    const { container: credit } = render(<Money amount="412.60" tone="credit" />)
    expect(credit.textContent).toContain('+')

    const { container: debt } = render(<Money amount="-280.10" tone="debt" />)
    expect(debt.textContent).toMatch(/[-−]/)

    // A plain total is not a claim about direction, so it gets no sign.
    const { container: plain } = render(<Money amount="212.30" />)
    expect(plain.textContent).not.toContain('+')
  })
})
