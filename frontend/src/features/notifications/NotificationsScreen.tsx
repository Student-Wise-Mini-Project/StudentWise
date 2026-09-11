import { useSearchParams } from 'react-router'

import type { Notification } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { InfiniteList } from '@/components/InfiniteList'
import { ListRow } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { EmptyState } from '@/components/feedback'
import { BellIcon } from '@/components/icons'
import { Page } from '@/components/layout'
import { formatRelative } from '@/lib/dates'

import { useMarkAllRead, useMarkRead, useNotifications } from './api'

export function NotificationsScreen() {
  const [params, setParams] = useSearchParams()
  const unreadOnly = params.get('unread') === '1'
  const list = useNotifications(unreadOnly)
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  return (
    <>
      <AppBar
        title="Alerts"
        actions={
          <Button
            size="sm"
            variant="ghost"
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </Button>
        }
      />

      <Page width="narrow">
        <div className="px-4 py-3">
          <SegmentedControl
            name="Filter"
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              if (value === 'unread') next.set('unread', '1')
              else next.delete('unread')
              setParams(next, { replace: true })
            }}
            segments={[
              { value: 'all', label: 'Everything' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
        </div>

        <InfiniteList
          query={list}
          renderItem={(item: Notification) => (
            <NotificationRow
              key={item.id}
              item={item}
              onOpen={() => {
                if (item.read_at === null) markRead.mutate(item.id)
              }}
            />
          )}
          empty={
            <EmptyState
              icon={<BellIcon className="size-10" />}
              title={unreadOnly ? 'Nothing unread' : 'Nothing yet'}
              body={
                unreadOnly
                  ? 'You are all caught up.'
                  : 'You will hear about new expenses, comments and payments here.'
              }
              size="page"
            />
          }
        />
      </Page>
    </>
  )
}

/**
 * One notification.
 *
 * `title` and `body` are rendered by the server at read time from a `kind` plus
 * a payload of plain facts -- no wording is stored. That is what lets the same
 * row be shown in Hebrew later without a migration, and it is why this component
 * renders what it is given rather than composing a sentence of its own.
 */
function NotificationRow({ item, onOpen }: { item: Notification; onOpen: () => void }) {
  const unread = item.read_at === null
  const to = item.expense_id ? `/expenses/${item.expense_id}` : undefined

  return (
    <ListRow
      to={to}
      onClick={to ? undefined : onOpen}
      leading={
        item.actor ? (
          <Avatar user={item.actor} />
        ) : (
          // Budget and bill notifications have no actor: nobody did them.
          <span className="bg-sunken text-muted flex size-10 items-center justify-center rounded-md">
            <BellIcon className="size-5" />
          </span>
        )
      }
      title={
        <span className={unread ? 'font-semibold' : undefined}>
          {item.title}
          {unread && <span className="bg-accent ms-2 inline-block size-2 rounded-sm" />}
        </span>
      }
      subtitle={item.body}
      metaSubtitle={formatRelative(item.created_at)}
      trailing={item.kind.startsWith('BUDGET') ? <Badge tone="warn">Budget</Badge> : undefined}
    />
  )
}
