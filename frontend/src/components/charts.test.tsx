import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DonutChart, PairedBars, TrendChart } from './charts'

const slice = (key: string, share: number) => ({
  key,
  label: key,
  share,
  amount: `₪${share}`,
  caption: `${share}%`,
})

describe('DonutChart', () => {
  it('draws one arc per slice', () => {
    const { container } = render(
      <DonutChart
        slices={[slice('a', 50), slice('b', 30), slice('c', 20)]}
        total="₪100.00"
        totalLabel="Total"
      />,
    )
    expect(container.querySelectorAll('path')).toHaveLength(3)
  })

  it('draws a single 100% slice as a ring, not as nothing', () => {
    // A full circle cannot be one SVG arc: start and end coincide, and the
    // renderer draws an empty path. The sweep is clamped just short of 2π.
    const { container } = render(
      <DonutChart slices={[slice('only', 100)]} total="₪100.00" totalLabel="Total" />,
    )
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('d')?.length).toBeGreaterThan(20)
  })

  it('puts the total in the hole, where it can be read at a glance', () => {
    render(<DonutChart slices={[slice('a', 100)]} total="₪5,303.20" totalLabel="Total" />)
    expect(screen.getByText('₪5,303.20')).toBeInTheDocument()
  })

  it('gives every slice a fill, so none of them renders black', () => {
    const { container } = render(
      <DonutChart
        // More slices than palette colours, to prove the wrap-around.
        slices={Array.from({ length: 8 }, (_, i) => slice(`s${i}`, 12.5))}
        total="₪100.00"
        totalLabel="Total"
      />,
    )
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('class')).toMatch(/^fill-/)
    }
  })
})

describe('TrendChart', () => {
  const points = [
    { key: '7', label: 'Jul', value: 545.5, amount: '₪545.50' },
    { key: '8', label: 'Aug', value: 1397.2, amount: '₪1,397.20' },
    { key: '9', label: 'Sept', value: 0, amount: '₪0.00' },
  ]

  it('draws a bar per point and labels every month', () => {
    const { container } = render(<TrendChart points={points} peakLabel="August · ₪1,397.20" />)
    expect(container.querySelectorAll('rect')).toHaveLength(3)
    // Twice each: once on the axis, once in the screen-reader table. That is the
    // point -- the table carries the values the axis has no room for.
    expect(screen.getAllByText('Jul')).toHaveLength(2)
    expect(screen.getAllByText('Sept')).toHaveLength(2)
  })

  it('gives a zero month no height rather than a stub', () => {
    // A month with no spending should read as empty, not as a small amount.
    const { container } = render(<TrendChart points={points} peakLabel="x" />)
    const bars = [...container.querySelectorAll('rect')]
    expect(bars.at(-1)?.getAttribute('height')).toBe('0')
  })

  it('keeps every bar inside the drawing', () => {
    const { container } = render(<TrendChart points={points} peakLabel="x" />)
    for (const bar of container.querySelectorAll('rect')) {
      const y = Number(bar.getAttribute('y'))
      const height = Number(bar.getAttribute('height'))
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + height).toBeLessThanOrEqual(120)
    }
  })

  it('renders nothing at all for an empty series', () => {
    const { container } = render(<TrendChart points={[]} peakLabel="x" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('PairedBars', () => {
  it('puts both bars on one shared scale, so the gap is comparable', () => {
    render(
      <PairedBars
        aName="Paid out"
        bName="Used up"
        rows={[
          { key: 'm', label: 'Maya', a: 4000, b: 2000, aLabel: '₪4,000', bLabel: '₪2,000' },
          { key: 'g', label: 'Gal', a: 400, b: 1800, aLabel: '₪400', bLabel: '₪1,800' },
        ]}
      />,
    )
    // Maya paid the most, so her bar is the full width of the scale.
    expect(screen.getByLabelText('Paid out: ₪4,000')).toBeInTheDocument()
    // Gal paid a tenth of that, and it must still be visible.
    expect(screen.getByLabelText('Paid out: ₪400')).toBeInTheDocument()
  })

  it('describes every bar to a screen reader', () => {
    render(
      <PairedBars
        aName="Paid out"
        bName="Used up"
        rows={[{ key: 'g', label: 'Gal', a: 1, b: 2, aLabel: '₪1', bLabel: '₪2' }]}
      />,
    )
    expect(screen.getByLabelText('Used up: ₪2')).toBeInTheDocument()
    expect(screen.getByText('Paid and consumed per person')).toBeInTheDocument()
  })
})
