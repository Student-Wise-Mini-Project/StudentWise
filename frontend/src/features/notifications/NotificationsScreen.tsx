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
import { useT } from '@/i18n/i18nContext'
import { formatRelative } from '@/lib/dates'

import { useMarkAllRead, useMarkRead, useNotifications } from './api'
import { renderNotification } from './render'

export function NotificationsScreen() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const unreadOnly = params.get('unread') === '1'
  const list = useNotifications(unreadOnly)
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  return (
    <>
      <AppBar
        title={t('notifications.title')}
        actions={
          <Button
            size="sm"
            variant="ghost"
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t('notifications.markAllRead')}
          </Button>
        }
      />

      <Page width="narrow">
        <div className="px-4 py-3">
          <SegmentedControl
            name={t('notifications.filter')}
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              if (value === 'unread') next.set('unread', '1')
              else next.delete('unread')
              setParams(next, { replace: true })
            }}
            segments={[
              { value: 'all', label: t('notifications.filterAll') },
              { value: 'unread', label: t('notifications.filterUnread') },
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
              title={
                unreadOnly ? t('notifications.emptyUnreadTitle') : t('notifications.emptyAllTitle')
              }
              body={
                unreadOnly ? t('notifications.emptyUnreadBody') : t('notifications.emptyAllBody')
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
 * No wording is stored: a row is a `kind` plus a payload of plain facts. The
 * server renders those into English at read time and sends the result, and the
 * client renders the same facts into the active language -- see `render.ts`,
 * which is a port of `notification_service.render()`.
 *
 * "later without a migration" is what the schema comment promised. This is
 * later, and there was no migration.
 */
function NotificationRow({ item, onOpen }: { item: Notification; onOpen: () => void }) {
  const t = useT()
  const { title, body } = renderNotification(t, item)
  const unread = item.read_at === null
  const to = item.expense_id ? `/expenses/${item.expense_id}` : undefined

  return (
    <ListRow
      to={to}
      // So the expense's back arrow returns here rather than to its group.
      linkState={{ from: '/notifications' }}
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
          {title}
          {unread && <span className="bg-accent ms-2 inline-block size-2 rounded-sm" />}
        </span>
      }
      subtitle={body}
      metaSubtitle={formatRelative(item.created_at)}
      trailing={
        item.kind.startsWith('BUDGET') ? (
          <Badge tone="warn">{t('notifications.budgetBadge')}</Badge>
        ) : undefined
      }
    />
  )
}
