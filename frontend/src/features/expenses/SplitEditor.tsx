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
import { divideForDisplay } from '@/lib/money'

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
 * Four modes that deliberately share one layout: a row per person, a checkbox,
 * and — for three of the four — one field. Switching mode must not feel like
 * switching screen, because the common case is EQUAL and the rare case still has
 * to be reachable without a detour.
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
    <div className="flex flex-col gap-3">
      <SegmentedControl
        name="How is it split?"
        value={splitType}
        onChange={(next) => {
          onSplitTypeChange(next)
          // Values mean different things per mode, so carrying them across would
          // turn "40 shekels" into "40 per cent". Weights reset to the group's
          // agreed defaults; everything else clears.
          onParticipantsChange(
            participants.map((p) => ({
              ...p,
              shareValue:
                next === 'WEIGHT'
                  ? String(members.find((m) => m.user.id === p.userId)?.default_split_weight ?? '1')
                  : '',
            })),
          )
        }}
        segments={SPLIT_TYPES.map((type) => ({ value: type, label: splitTypeLabel[type] }))}
      />

      <p className="text-muted text-xs">{splitTypeHint[splitType]}</p>

      <div className="border-line divide-line divide-y rounded-xl border">
        {members.map((member) => {
          const draft = selected.get(member.user.id)
          const isOn = draft !== undefined

          return (
            <div
              key={member.user.id}
              className={cn('flex items-center gap-3 px-3 py-2.5', !isOn && 'opacity-55')}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(member)}
                  className="accent-accent size-5 shrink-0"
                />
                <Avatar user={member.user} size="sm" />
                <span className="truncate text-base font-medium">{member.user.name}</span>
              </label>

              {isOn && splitType === 'EXACT' && (
                <div className="flex w-36 shrink-0 items-center gap-1">
                  <MoneyInput
                    value={draft.shareValue}
                    onValueChange={(value) => setValue(member.user.id, value)}
                    aria-label={`${member.user.name}'s amount`}
                    className="h-9 text-base"
                  />
                </div>
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
                  className="tnum h-9 w-24 shrink-0 text-end"
                />
              )}

              {isOn && splitType === 'EQUAL' && equalShare && (
                <Money amount={equalShare} currency={currency} tone="muted" className="shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {splitType === 'EQUAL' && participants.length > 0 && (
        <p className="text-muted text-xs">
          Shown rounded. The exact shares are worked out when you save, so they add up to the total
          to the cent.
        </p>
      )}

      {splitType === 'EXACT' && participants.length > 1 && (
        <div className="flex flex-wrap gap-2">
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

      {validation.message && (
        <p role="status" className="text-debt text-sm font-medium">
          {validation.message}
        </p>
      )}
    </div>
  )
}
