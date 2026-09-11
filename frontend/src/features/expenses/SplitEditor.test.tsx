import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { GroupMember, SplitType } from '@/api/types'

import { SplitEditor } from './SplitEditor'
import type { ParticipantDraft } from './splitValidation'

const member = (id: string, name: string, weight: string): GroupMember => ({
  user: {
    id,
    name,
    email: `${name.toLowerCase()}@x.dev`,
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  role: 'MEMBER',
  default_split_weight: weight,
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
})

const MEMBERS = [member('u1', 'Gal', '2'), member('u2', 'Maya', '1'), member('u3', 'Noa', '1')]

function Harness({ total = '212.30', initialType = 'EQUAL' as SplitType }) {
  const [splitType, setSplitType] = useState<SplitType>(initialType)
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    MEMBERS.map((m) => ({ userId: m.user.id, shareValue: '' })),
  )
  return (
    <SplitEditor
      members={MEMBERS}
      splitType={splitType}
      onSplitTypeChange={setSplitType}
      participants={participants}
      onParticipantsChange={setParticipants}
      total={total}
      currency="ILS"
    />
  )
}

describe('the client never claims to know a split', () => {
  it('marks the equal-split preview as approximate', async () => {
    // 212.30 / 3 = 70.7666..., and the server will hand out 70.77 / 70.77 / 70.76
    // by largest remainder. Showing a bare "70.77" would be wrong for one person
    // and that is the person who checks.
    render(<Harness />)
    const approximations = screen.getAllByLabelText(/approximately/i)
    expect(approximations).toHaveLength(3)
    expect(approximations[0]).toHaveTextContent('70.76')
  })

  it('says out loud that the exact shares are worked out on save', () => {
    render(<Harness />)
    expect(screen.getByText(/exact shares are worked out when you save/i)).toBeInTheDocument()
  })

  it('shows NO money at all for percentages', async () => {
    // A percentage could be turned into money with one multiplication. That is
    // precisely the re-derivation the contract forbids, so the editor shows the
    // percentage and nothing else.
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Percentages' }))

    expect(screen.queryByLabelText(/approximately/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/70\.7/)).not.toBeInTheDocument()
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument()
  })

  it('shows NO money at all for shares', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Shares' }))

    expect(screen.queryByLabelText(/approximately/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/70\.7/)).not.toBeInTheDocument()
  })
})

describe('switching mode', () => {
  it('seeds shares from what the group already agreed', async () => {
    // `default_split_weight` exists so rent-by-room-size does not have to be
    // retyped every month.
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Shares' }))

    expect(screen.getByLabelText("Gal's share")).toHaveValue('2')
    expect(screen.getByLabelText("Maya's share")).toHaveValue('1')
  })

  it('clears values that would mean something different in the new mode', async () => {
    // 40 shekels must not silently become 40 per cent.
    const user = userEvent.setup()
    render(<Harness initialType="EXACT" />)

    const galAmount = screen.getByLabelText("Gal's amount")
    await user.clear(galAmount)
    await user.type(galAmount, '40')
    await user.tab()

    await user.click(screen.getByRole('radio', { name: 'Percentages' }))
    expect(screen.getByLabelText("Gal's percentage")).toHaveValue('')
  })
})

describe('validation', () => {
  it('names the shortfall on an exact split that does not add up', async () => {
    const user = userEvent.setup()
    render(<Harness total="100.00" initialType="EXACT" />)

    for (const name of ['Gal', 'Maya', 'Noa']) {
      const field = screen.getByLabelText(`${name}'s amount`)
      await user.clear(field)
      await user.type(field, '33.33')
      await user.tab()
    }

    expect(screen.getByRole('status')).toHaveTextContent('0.01 still to allocate')
  })

  it('offers to hand the remainder to one person', async () => {
    const user = userEvent.setup()
    render(<Harness total="100.00" initialType="EXACT" />)

    const gal = screen.getByLabelText("Gal's amount")
    await user.clear(gal)
    await user.type(gal, '50')
    await user.tab()

    const give = screen.getByRole('button', { name: /Give the rest to Maya/ })
    await user.click(give)

    // 100 - 50 - 0 = 50. A subtraction over what was typed, not a rounding rule.
    expect(screen.getByLabelText("Maya's amount")).toHaveValue('50.00')
  })

  it('complains when percentages do not reach 100', async () => {
    const user = userEvent.setup()
    render(<Harness initialType="PERCENTAGE" />)

    for (const name of ['Gal', 'Maya', 'Noa']) {
      await user.type(screen.getByLabelText(`${name}'s percentage`), '33')
    }

    expect(screen.getByRole('status')).toHaveTextContent('Adds up to 99.00%, not 100%')
  })

  it('asks for at least one person', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    for (const name of ['Gal', 'Maya', 'Noa']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name) }))
    }
    expect(screen.getByRole('status')).toHaveTextContent('Pick at least one person')
  })
})
