import type { GroupMember, SplitType } from '@/api/types'
import { SPLIT_TYPES } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/cn'
import { splitTypeHint, splitTypeLabel } from '@/lib/labels'
import { addAll, divideForDisplay } from '@/lib/money'

import { remainderFor, validateSplit, type ParticipantDraft } from './splitValidation'

export type SplitEditorProps = {
  members: GroupMember[]
  splitType: SplitType
  onSplitTypeChange: (splitType: SplitType) => void
  participants: ParticipantDraft[]
  onParticipantsChange: (participants: ParticipantDraft[]) => void
  total: string
  currency: string
}

/**
 * Who is on this expense, and how it is divided.
 *
 * Four modes that deliberately share one layout. The header, the participant
 * list, the avatars and the checkboxes are **identical** across all four —
 * only the control on the trailing edge of each row and the one summary line
 * in the header change. Switching mode must not feel like switching screen,
 * because the common case is EQUAL and the rare case still has to be reachable
 * without a detour.
 *
 * **No mode previews a per-person amount except EQUAL, and that one is marked
 * `≈`.** PERCENTAGE and WEIGHT could each be turned into money with one
 * multiplication, and that is exactly the temptation the contract forbids: the
 * server allocates the leftover cents by largest remainder, so any number shown
 * here would be right for most people and a cent out for one of them. The one
 * whose number is wrong is the one who notices.
 */
export function SplitEditor({
  members,
  splitType,
  onSplitTypeChange,
  participants,
  onParticipantsChange,
  total,
  currency,
}: SplitEditorProps) {
  const selected = new Map(participants.map((p) => [p.userId, p]))
  const validation = validateSplit(splitType, participants, total)
  const equalShare = splitType === 'EQUAL' ? divideForDisplay(total, participants.length) : null

  function toggle(member: GroupMember) {
    const userId = member.user.id
    if (selected.has(userId)) {
      onParticipantsChange(participants.filter((p) => p.userId !== userId))
      return
    }
    onParticipantsChange([
      ...participants,
      {
        userId,
        // A weight starts from what the group already agreed for this person,
        // which is the whole point of `default_split_weight`.
        shareValue: splitType === 'WEIGHT' ? String(member.default_split_weight) : '',
      },
    ])
  }

  function setValue(userId: string, shareValue: string) {
    onParticipantsChange(participants.map((p) => (p.userId === userId ? { ...p, shareValue } : p)))
  }

  return (
    <section className="flex flex-col">
      {/* One header line that every mode keeps: how many people are on this,
       * and whether what has been typed adds up yet. */}
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-2">
        <h2 className="text-muted font-display text-2xs font-extrabold tracking-[0.1em] uppercase">
          Split between {participants.length}
        </h2>
        <Summary
          splitType={splitType}
          participants={participants}
          memberCount={members.length}
          currency={currency}
          validation={validation}
        />
      </header>

      <div className="px-4">
        <SegmentedControl
          name="How is it split?"
          value={splitType}
          onChange={(next) => {
            onSplitTypeChange(next)
            // Values mean different things per mode, so carrying them across
            // would turn "40 shekels" into "40 per cent". Weights reset to the
            // group's agreed defaults; everything else clears.
            onParticipantsChange(
              participants.map((p) => ({
                ...p,
                shareValue:
                  next === 'WEIGHT'
                    ? String(
                        members.find((m) => m.user.id === p.userId)?.default_split_weight ?? '1',
                      )
                    : '',
              })),
            )
          }}
          segments={SPLIT_TYPES.map((type) => ({ value: type, label: splitTypeLabel[type] }))}
        />
      </div>

      <div className="bg-surface border-line divide-line mt-3 divide-y border-y">
        {members.map((member) => {
          const draft = selected.get(member.user.id)
          const isOn = draft !== undefined

          return (
            <div
              key={member.user.id}
              className={cn('flex items-center gap-3 px-4 py-2.5', !isOn && 'opacity-55')}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(member)}
                  className="accent-accent size-5 shrink-0 rounded-sm"
                />
                <Avatar user={member.user} size="sm" />
                <span className="truncate text-base font-semibold">{member.user.name}</span>
              </label>

              {/* A fixed box on the trailing edge, so the names and avatars do
               * not move a pixel when the mode changes under them. */}
              <div className="flex w-32 shrink-0 justify-end">
                {isOn && splitType === 'EXACT' && (
                  <MoneyInput
                    value={draft.shareValue}
                    onValueChange={(value) => setValue(member.user.id, value)}
                    aria-label={`${member.user.name}'s amount`}
                    className="h-10 text-base"
                  />
                )}

                {isOn && (splitType === 'PERCENTAGE' || splitType === 'WEIGHT') && (
                  <Input
                    value={draft.shareValue}
                    onChange={(event) => setValue(member.user.id, event.target.value)}
                    inputMode="decimal"
                    aria-label={
                      splitType === 'PERCENTAGE'
                        ? `${member.user.name}'s percentage`
                        : `${member.user.name}'s share`
                    }
                    slotEnd={splitType === 'PERCENTAGE' ? <span className="text-sm">%</span> : null}
                    className="tnum h-10 w-24 text-end"
                  />
                )}

                {isOn && splitType === 'EQUAL' && equalShare && (
                  <Money amount={equalShare} currency={currency} tone="muted" size="lg" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-muted px-4 pt-2.5 text-xs" dir="auto">
        {splitTypeHint[splitType]}
        {splitType === 'EQUAL' &&
          participants.length > 0 &&
          ' Shown rounded — the exact shares are worked out when you save, so they add up to the total to the cent.'}
      </p>

      {splitType === 'EXACT' && participants.length > 1 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {participants.map((participant) => {
            const rest = remainderFor(participants, participant.userId, total)
            const member = members.find((m) => m.user.id === participant.userId)
            if (!member || rest === null || rest.startsWith('-')) return null
            return (
              <Button
                key={participant.userId}
                size="sm"
                variant="secondary"
                onClick={() => setValue(participant.userId, rest)}
              >
                Give the rest to {member.user.name}
              </Button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/**
 * The one line that changes per mode.
 *
 * Deliberately the *only* thing in the header that does. It is a live reading
 * of what has been typed, not an error: "₪41.30 left to assign" is a statement
 * about a form halfway through being filled in, and shouting at someone for
 * that is how a four-field form feels like an exam.
 */
function Summary({
  splitType,
  participants,
  memberCount,
  currency,
  validation,
}: {
  splitType: SplitType
  participants: ParticipantDraft[]
  memberCount: number
  currency: string
  validation: ReturnType<typeof validateSplit>
}) {
  const classes = cn('text-sm', validation.valid ? 'text-muted' : 'text-debt font-semibold')

  if (participants.length === 0) {
    return (
      <p role="status" className="text-debt text-sm font-semibold">
        Pick at least one person.
      </p>
    )
  }

  if (splitType === 'EQUAL') {
    return (
      <p role="status" className={classes}>
        {participants.length === memberCount
          ? 'Everyone'
          : `${participants.length} of ${memberCount} selected`}
      </p>
    )
  }

  if (splitType === 'EXACT') {
    const left = validation.remaining
    if (left === null) {
      return (
        <p role="status" className={classes}>
          {validation.message}
        </p>
      )
    }
    if (validation.valid) {
      return (
        <p role="status" className="text-credit text-sm font-semibold">
          Adds up exactly
        </p>
      )
    }
    const over = left.startsWith('-')
    return (
      <p role="status" className="text-debt text-sm font-semibold">
        <Money amount={left} currency={currency} size="sm" className="text-inherit" />
        {over ? ' over the total' : ' left to assign'}
      </p>
    )
  }

  const sum = addAll(participants.map((p) => (p.shareValue.trim() === '' ? '0' : p.shareValue)))

  if (splitType === 'PERCENTAGE') {
    return (
      <p role="status" className={classes}>
        <span className="tnum amount">{trim(sum)}%</span> of 100%
      </p>
    )
  }

  return (
    <p role="status" className={classes}>
      Weights total <span className="tnum amount">{trim(sum)}</span>
    </p>
  )
}

/**
 * `"100.00"` reads as money; a percentage or a weight is just `"100"`.
 *
 * Only zeros *after a decimal point* go — stripping a trailing zero run without
 * that anchor turns 100 into 1.
 */
function trim(value: string): string {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
