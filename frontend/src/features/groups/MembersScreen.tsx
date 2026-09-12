import { useMemo, useState } from 'react'

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

import { useNavigate } from 'react-router'

import { useSettlementPlan } from '@/features/balances/api'

import {
  useAddMember,
  useCloseGroup,
  useDeleteGroup,
  useRemoveMember,
  useReopenGroup,
  useUpdateMemberWeight,
} from './api'
import { useGroupScope } from './groupContext'
import { SuggestionChips } from './SuggestionChips'
import { useMemberSuggestions } from './suggestions'

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

      {isOwner && <DangerZone />}

      <AddMemberSheet open={adding} onClose={() => setAdding(false)} />
      <WeightSheet member={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/**
 * Closing and deleting, owner-only.
 *
 * This lives at the bottom of the Members tab, which is not where anyone would
 * think to look for "close this group". The alternative was an AppBar overflow
 * menu, and there is no menu component -- a new primitive or a new route for
 * two buttons. Taken knowingly; it moves in an afternoon.
 */
function DangerZone() {
  const t = useT()
  const { isOpen } = useGroupScope()
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const reopen = useReopenGroup()
  const { groupId } = useGroupScope()

  return (
    <>
      <ListSection header={t('groups.danger.header')}>
        <div className="flex flex-wrap gap-2 px-4 py-3.5">
          {isOpen ? (
            <Button variant="danger" onClick={() => setClosing(true)}>
              {t('groups.danger.close')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              loading={reopen.isPending}
              onClick={() => reopen.mutate(groupId)}
            >
              {t('groups.closed.reopen')}
            </Button>
          )}
          <Button variant="danger" onClick={() => setDeleting(true)}>
            {t('groups.danger.delete')}
          </Button>
        </div>
        {reopen.isError && (
          <p role="alert" className="text-danger px-4 pb-3 text-sm">
            {detailOf(reopen.error)}
          </p>
        )}
      </ListSection>

      <CloseGroupSheet open={closing} onClose={() => setClosing(false)} />
      <DeleteGroupSheet open={deleting} onClose={() => setDeleting(false)} />
    </>
  )
}

/**
 * Closing, with what it costs spelled out.
 *
 * The settlement plan is read here so the sheet can name what is still owed.
 * Closing is deliberately still allowed -- real trips end with somebody paying
 * in cash, and a group that cannot be closed until the app agrees it is square
 * is a group nobody can ever close. But it is not allowed to be a surprise.
 */
function CloseGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const close = useCloseGroup()
  const plan = useSettlementPlan(groupId)
  const navigate = useNavigate()

  const transfers = plan.data?.transfers ?? []

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('groups.danger.closeTitle')}
      description={t('groups.danger.closeBody')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={close.isPending}
            onClick={() =>
              close.mutate(groupId, {
                onSuccess: () => {
                  onClose()
                  void navigate('/groups')
                },
              })
            }
          >
            {t('groups.danger.closeAnyway')}
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        {close.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(close.error)}
          </p>
        )}

        {transfers.length === 0 ? (
          <p className="text-muted text-sm">{t('groups.danger.closeSquare')}</p>
        ) : (
          <>
            <p className="text-muted font-display text-2xs font-extrabold tracking-[0.1em] uppercase">
              {t('groups.danger.closeOutstandingHeader')}
            </p>
            {transfers.map((transfer) => (
              <p
                key={`${transfer.from_user.id}-${transfer.to_user.id}`}
                className="flex items-center justify-between gap-3 text-sm"
                dir="auto"
              >
                <span>
                  {t('groups.danger.closeOutstanding', {
                    from: transfer.from_user.name,
                    to: transfer.to_user.name,
                  })}
                </span>
                <Money amount={transfer.amount} currency={currency} size="sm" />
              </p>
            ))}
          </>
        )}
      </Stack>
    </Sheet>
  )
}

/**
 * Deleting, behind the group's own name.
 *
 * A typed confirmation rather than a second "are you sure": this is the one
 * action in the app that destroys history, and the sheet points at closing as
 * the thing most people actually meant.
 */
function DeleteGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { groupId, group } = useGroupScope()
  const remove = useDeleteGroup()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')

  function reset() {
    setTyped('')
    remove.reset()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={reset}
      title={t('groups.danger.deleteTitle')}
      description={t('groups.danger.deleteBody')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={remove.isPending}
            disabled={typed !== group.name}
            onClick={() =>
              remove.mutate(groupId, {
                onSuccess: () => {
                  reset()
                  void navigate('/groups')
                },
              })
            }
          >
            {t('groups.danger.deleteSubmit')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {remove.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(remove.error)}
          </p>
        )}

        <Field label={t('groups.danger.deleteConfirmLabel')} required>
          {(props) => (
            <Input
              {...props}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={group.name}
              autoComplete="off"
              autoFocus
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}

function AddMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { groupId, activeMembers } = useGroupScope()
  const add = useAddMember(groupId)
  const [email, setEmail] = useState('')

  // Only the *active* members are excluded. Somebody who left is a fair
  // suggestion: `add_member` revives their row rather than refusing it, and
  // housemates do come back.
  const alreadyHere = useMemo(() => activeMembers.map((member) => member.user.id), [activeMembers])
  const suggestions = useMemberSuggestions(alreadyHere)

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
        {suggestions.length > 0 && (
          <Field label={t('groups.suggestions.label')} hint={t('groups.suggestions.hint')}>
            {() => (
              <SuggestionChips
                suggestions={suggestions}
                selected={[]}
                // One tap, no email round trip: the id is already in hand.
                onToggle={(userId) => add.mutate({ user_id: userId }, { onSuccess: reset })}
              />
            )}
          </Field>
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
