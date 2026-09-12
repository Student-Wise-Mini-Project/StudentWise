import { useState } from 'react'

import { detailOf } from '@/api/errors'
import type { GroupMember } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Sheet } from '@/components/Sheet'
import { Stack } from '@/components/layout'
import { Money } from '@/components/Money'
import { useAuth } from '@/features/auth/authContext'
import { useBalances } from '@/features/balances/api'
import { cn } from '@/lib/cn'
import { useT } from '@/i18n/i18nContext'
import { memberRoleLabel } from '@/lib/labels'
import { isPositive, isValidAmount, isZero } from '@/lib/money'

import { useAddMember, useRemoveMember, useUpdateMemberWeight } from './api'
import { useGroupScope } from './groupContext'

export function MembersScreen() {
  const t = useT()
  const { activeMembers, allMembers, isOwner, isOpen, groupId, currency } = useGroupScope()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GroupMember | null>(null)

  const departed = allMembers.filter((member) => member.left_at !== null)
  const remove = useRemoveMember(groupId)

  // Already in the cache from the group header, so this costs nothing: a
  // members list without balances is a list of names, and the question people
  // actually have about a housemate is how much.
  const balances = useBalances(groupId)
  const netOf = (userId: string) =>
    balances.data?.balances.find((row) => row.user.id === userId)?.net

  return (
    <>
      <ListSection
        header={t('groups.members.header')}
        action={
          isOpen ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              {t('groups.members.addSomeone')}
            </Button>
          ) : undefined
        }
      >
        {activeMembers.map((member) => {
          const isMe = member.user.id === user?.id
          const canRemove = isOwner || isMe
          const net = netOf(member.user.id)
          return (
            <ListRow
              key={member.user.id}
              leading={<Avatar user={member.user} />}
              title={
                <>
                  {member.user.name}
                  {isMe && (
                    <span className="text-faint font-normal">{t('common.state.youMarker')}</span>
                  )}
                </>
              }
              subtitle={
                <>
                  {member.role === 'OWNER' && `${memberRoleLabel(t, member.role)} · `}
                  {t('groups.members.share', { weight: String(member.default_split_weight) })}
                </>
              }
              meta={
                net !== undefined ? (
                  <Money amount={net} currency={currency} tone="auto" size="lg" />
                ) : undefined
              }
              metaSubtitle={
                net === undefined ? undefined : isZero(net) ? (
                  t('common.state.square')
                ) : (
                  <span
                    className={cn('font-semibold', isPositive(net) ? 'text-credit' : 'text-debt')}
                  >
                    {isPositive(net) ? t('common.state.credit') : t('common.state.debt')}
                  </span>
                )
              }
              trailing={
                <Stack direction="row" gap={1}>
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(member)}>
                      {t('groups.members.weight')}
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(member.user.id)}
                      loading={remove.isPending && remove.variables === member.user.id}
                    >
                      {isMe ? t('common.actions.leave') : t('common.actions.remove')}
                    </Button>
                  )}
                </Stack>
              }
            />
          )
        })}
      </ListSection>

      <p className="text-muted px-4 py-3 text-xs">{t('groups.members.weightExplainer')}</p>

      {departed.length > 0 && (
        <>
          <ListSection header={t('groups.members.departedHeader')}>
            {departed.map((member) => (
              <ListRow
                key={member.user.id}
                leading={<Avatar user={member.user} className="opacity-50" />}
                title={member.user.name}
                subtitle={t('groups.members.departedSubtitle')}
              />
            ))}
          </ListSection>
          <p className="text-muted px-4 py-3 text-xs">{t('groups.members.departedNote')}</p>
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
  const t = useT()
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
      title={t('groups.members.addTitle')}
      description={t('groups.members.addDescription')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            fullWidth
            loading={add.isPending}
            disabled={email.trim().length === 0}
            onClick={() => add.mutate({ email: email.trim() }, { onSuccess: reset })}
          >
            {t('common.actions.add')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {add.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(add.error)}
          </p>
        )}
        <Field label={t('groups.members.addEmailLabel')} required>
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
  const t = useT()
  const { groupId } = useGroupScope()
  const update = useUpdateMemberWeight(groupId)
  const [weight, setWeight] = useState('1')

  const valid = isValidAmount(weight) && isPositive(weight)

  return (
    <Sheet
      open={member !== null}
      onClose={onClose}
      title={
        member
          ? t('groups.members.weightTitle', { name: member.user.name })
          : t('groups.members.weightTitleFallback')
      }
      description={t('groups.members.weightDescription')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            fullWidth
            loading={update.isPending}
            disabled={!valid}
            onClick={() =>
              member && update.mutate({ userId: member.user.id, weight }, { onSuccess: onClose })
            }
          >
            {t('common.actions.save')}
          </Button>
        </>
      }
    >
      <Field
        label={t('groups.members.weightLabel')}
        required
        hint={t('groups.members.weightHint')}
        error={!valid && weight !== '' ? t('groups.members.weightError') : undefined}
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
