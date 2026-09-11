import { useState } from 'react'

import { GROUP_TYPES, type GroupType } from '@/api/types'
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
import { groupTypeLabel } from '@/lib/labels'

import { useCreateGroup, useGroups } from './api'

export function GroupListScreen() {
  const groups = useGroups()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <AppBar
        title="Groups"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            New
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
            title="No groups yet"
            body="A group is a flat, a trip, or the two of you. Everything else hangs off one."
            action={{ label: 'Create a group', onClick: () => setCreating(true) }}
          />
        )}

        {groups.data && groups.data.length > 0 && (
          <ListSection className="pt-2">
            {groups.data.map((group) => {
              const active = group.members.filter((member) => member.left_at === null)
              return (
                <ListRow
                  key={group.id}
                  to={`/groups/${group.id}`}
                  title={group.name}
                  subtitle={`${active.length} ${active.length === 1 ? 'person' : 'people'}`}
                  leading={<AvatarStack users={active.map((member) => member.user)} max={3} />}
                  meta={<Badge>{groupTypeLabel[group.type]}</Badge>}
                  trailing={<ChevronEnd />}
                />
              )
            })}
          </ListSection>
        )}
      </Page>

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      title="New group"
      description="You can add the others once it exists."
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            Cancel
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
            Create
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

        <Field label="Name" required hint="Dizengoff 5, Greece 2026, us two.">
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

        <Field label="What kind?">
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(event) => setType(event.target.value as GroupType)}
            >
              {GROUP_TYPES.map((groupType) => (
                <option key={groupType} value={groupType}>
                  {groupTypeLabel[groupType]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
