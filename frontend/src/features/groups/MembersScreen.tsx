import { useState } from 'react'

import { detailOf } from '@/api/errors'
import type { GroupMember } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Sheet } from '@/components/Sheet'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { memberRoleLabel } from '@/lib/labels'
import { isValidAmount, isPositive } from '@/lib/money'

import { useAddMember, useRemoveMember, useUpdateMemberWeight } from './api'
import { useGroupScope } from './groupContext'

export function MembersScreen() {
  const { activeMembers, allMembers, isOwner, groupId } = useGroupScope()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GroupMember | null>(null)

  const departed = allMembers.filter((member) => member.left_at !== null)
  const remove = useRemoveMember(groupId)

  return (
    <>
      <ListSection
        header="In the group"
        action={
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add someone
          </Button>
        }
      >
        {activeMembers.map((member) => {
          const isMe = member.user.id === user?.id
          const canRemove = isOwner || isMe
          return (
            <ListRow
              key={member.user.id}
              leading={<Avatar user={member.user} />}
              title={isMe ? `${member.user.name} (you)` : member.user.name}
              subtitle={member.user.email}
              meta={
                <Stack direction="row" gap={2} className="items-center">
                  {member.role === 'OWNER' && (
                    <Badge tone="accent">{memberRoleLabel[member.role]}</Badge>
                  )}
                  <span className="text-muted tnum text-sm">
                    {String(member.default_split_weight)}&times;
                  </span>
                </Stack>
              }
              trailing={
                <Stack direction="row" gap={1}>
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(member)}>
                      Weight
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(member.user.id)}
                      loading={remove.isPending && remove.variables === member.user.id}
                    >
                      {isMe ? 'Leave' : 'Remove'}
                    </Button>
                  )}
                </Stack>
              }
            />
          )
        })}
      </ListSection>

      <p className="text-muted px-4 py-3 text-xs">
        A weight splits things in proportion &mdash; someone on 2 pays twice what someone on 1 does.
        It is only used when an expense is split by shares.
      </p>

      {departed.length > 0 && (
        <>
          <ListSection header="No longer in the group">
            {departed.map((member) => (
              <ListRow
                key={member.user.id}
                leading={<Avatar user={member.user} className="opacity-50" />}
                title={member.user.name}
                subtitle="Left. Their past expenses and any balance still count."
              />
            ))}
          </ListSection>
          <p className="text-muted px-4 py-3 text-xs">
            Leaving does not erase a debt. Someone who has left still appears in the balances until
            they are square, and can still be paid.
          </p>
        </>
      )}

      {remove.isError && (
        <p role="alert" className="text-danger px-4 py-2 text-sm">
          {detailOf(remove.error)}
        </p>
      )}

      <AddMemberSheet open={adding} onClose={() => setAdding(false)} />
      <WeightSheet member={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function AddMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { groupId } = useGroupScope()
  const add = useAddMember(groupId)
  const [email, setEmail] = useState('')

  function reset() {
    setEmail('')
    add.reset()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={reset}
      title="Add someone"
      description="They need a StudentWise account already."
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            Cancel
          </Button>
          <Button
            fullWidth
            loading={add.isPending}
            disabled={email.trim().length === 0}
            onClick={() => add.mutate({ email: email.trim() }, { onSuccess: reset })}
          >
            Add
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {add.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2.5 text-sm">
            {detailOf(add.error)}
          </p>
        )}
        <Field label="Their email" required>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}

function WeightSheet({ member, onClose }: { member: GroupMember | null; onClose: () => void }) {
  const { groupId } = useGroupScope()
  const update = useUpdateMemberWeight(groupId)
  const [weight, setWeight] = useState('1')

  const valid = isValidAmount(weight) && isPositive(weight)

  return (
    <Sheet
      open={member !== null}
      onClose={onClose}
      title={member ? `${member.user.name}'s share` : 'Share'}
      description="Used when an expense is split by shares."
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            loading={update.isPending}
            disabled={!valid}
            onClick={() =>
              member && update.mutate({ userId: member.user.id, weight }, { onSuccess: onClose })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <Field
        label="Share"
        required
        hint="Bigger room, bigger number."
        error={!valid && weight !== '' ? 'Has to be a number above zero.' : undefined}
      >
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            autoFocus
          />
        )}
      </Field>
    </Sheet>
  )
}
