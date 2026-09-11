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
