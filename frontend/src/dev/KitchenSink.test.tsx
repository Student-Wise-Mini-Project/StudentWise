import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { KitchenSink } from './KitchenSink'

/**
 * A smoke test for the whole component library at once.
 *
 * The gallery renders every primitive in every variant, so if any of them throws
 * on mount -- a bad `useId`, a missing required prop, a `<dialog>` method jsdom
 * does not implement -- this catches it without a test per component.
 */
describe('the component gallery', () => {
  it('mounts every primitive without throwing', () => {
    render(
      <MemoryRouter>
        <KitchenSink />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Kitchen sink' })).toBeInTheDocument()
  })

  it('wires labels to their controls, so the forms are usable by keyboard', () => {
    render(
      <MemoryRouter>
        <KitchenSink />
      </MemoryRouter>,
    )
    // `getByLabelText` only finds a control whose label is actually associated
    // with it, so this fails the moment `Field` stops wiring `htmlFor`/`id`.
    expect(screen.getByLabelText(/^Title/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Category/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Notes/)).toBeInTheDocument()
  })

  it('announces a field error to a screen reader, not just in red text', () => {
    render(
      <MemoryRouter>
        <KitchenSink />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/99\.99/)
  })

  it('offers all four split types at once rather than behind a dropdown', () => {
    render(
      <MemoryRouter>
        <KitchenSink />
      </MemoryRouter>,
    )
    const group = screen.getByRole('radiogroup', { name: 'split type' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })
})
