import { useState } from 'react'

import { GROUP_TYPES, type Group, type GroupType } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { AvatarStack } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Sheet } from '@/components/Sheet'
import { EmptyState, ErrorState, ListRowSkeleton } from '@/components/feedback'
import { ChevronEnd, GroupsIcon } from '@/components/icons'
import { Page, Stack } from '@/components/layout'
import { detailOf } from '@/api/errors'
import { useAuth } from '@/features/auth/authContext'
import { useT } from '@/i18n/i18nContext'
import { groupTypeLabel } from '@/lib/labels'

import { useCreateGroup, useGroups, useReopenGroup } from './api'

export function GroupListScreen() {
  const t = useT()
  const groups = useGroups()
  const [creating, setCreating] = useState(false)

  // Closed groups stay on this screen rather than disappearing from it. A trip
  // that ended is still a thing that happened, and may still owe somebody
  // money -- it just belongs under its own heading, below the live ones.
  const open = groups.data?.filter((group) => group.archived_at === null) ?? []
  const closed = groups.data?.filter((group) => group.archived_at !== null) ?? []

  return (
    <>
      <AppBar
        title={t('groups.list.title')}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            {t('groups.list.new')}
          </Button>
        }
      />

      <Page width="narrow">
        {groups.isLoading && <ListRowSkeleton />}
        {groups.isError && (
          <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
        )}

        {groups.data?.length === 0 && (
          <EmptyState
            icon={<GroupsIcon className="size-10" />}
            title={t('groups.list.emptyTitle')}
            body={t('groups.list.emptyBody')}
            action={{ label: t('groups.list.emptyAction'), onClick: () => setCreating(true) }}
          />
        )}

        {open.length > 0 && (
          <ListSection className="pt-2">
            {open.map((group) => (
              <GroupRow key={group.id} group={group} />
            ))}
          </ListSection>
        )}

        {closed.length > 0 && (
          <ListSection header={t('groups.closed.sectionHeader')}>
            {closed.map((group) => (
              <GroupRow key={group.id} group={group} closed />
            ))}
          </ListSection>
        )}
      </Page>

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

/**
 * One row shape for both sections.
 *
 * A closed group is dimmed and carries "Closed" where an open one carries its
 * kind -- the badge slot says the most useful thing about the group, and once
 * it is closed that is no longer "Trip".
 *
 * Its owner gets Reopen here rather than only inside the group. Reopening is
 * the answer to "I closed the wrong one", and that is realised while looking
 * at the list, not after walking into the group to find out.
 */
function GroupRow({ group, closed = false }: { group: Group; closed?: boolean }) {
  const t = useT()
  const { user } = useAuth()
  const reopen = useReopenGroup()

  const active = group.members.filter((member) => member.left_at === null)
  const isOwner = group.members.some(
    (member) => member.user.id === user?.id && member.role === 'OWNER',
  )

  return (
    <ListRow
      to={`/groups/${group.id}`}
      title={group.name}
      subtitle={t('groups.list.memberCount', { count: active.length })}
      leading={
        <AvatarStack
          users={active.map((member) => member.user)}
          max={3}
          className={closed ? 'opacity-50' : undefined}
        />
      }
      meta={<Badge>{closed ? t('groups.closed.badge') : groupTypeLabel(t, group.type)}</Badge>}
      trailing={
        closed && isOwner ? (
          <Button
            size="sm"
            variant="secondary"
            loading={reopen.isPending}
            onClick={(event) => {
              // The whole row is a link to the group; reopening is not a
              // reason to also walk into it.
              event.preventDefault()
              event.stopPropagation()
              reopen.mutate(group.id)
            }}
          >
            {t('groups.closed.reopen')}
          </Button>
        ) : (
          <ChevronEnd />
        )
      }
    />
  )
}

function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const create = useCreateGroup()
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('SHARED_APARTMENT')

  function reset() {
    setName('')
    setType('SHARED_APARTMENT')
    create.reset()
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={reset}
      title={t('groups.create.title')}
      description={t('groups.create.description')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            fullWidth
            loading={create.isPending}
            disabled={name.trim().length === 0}
            onClick={() =>
              create.mutate(
                { name: name.trim(), type },
                {
                  onSuccess: reset,
                },
              )
            }
          >
            {t('common.actions.create')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {create.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(create.error)}
          </p>
        )}

        <Field label={t('groups.create.nameLabel')} required hint={t('groups.create.nameHint')}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoFocus
            />
          )}
        </Field>

        <Field label={t('groups.create.kindLabel')}>
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(event) => setType(event.target.value as GroupType)}
            >
              {GROUP_TYPES.map((groupType) => (
                <option key={groupType} value={groupType}>
                  {groupTypeLabel(t, groupType)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
