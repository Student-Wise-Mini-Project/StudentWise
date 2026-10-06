import { AppBar } from '@/app/layouts/AppBar'
import { Button, LinkButton } from '@/components/Button'
import { ListRow } from '@/components/ListRow'
import { EmptyState, ErrorState, ListRowSkeleton } from '@/components/feedback'
import { ChevronEnd } from '@/components/icons'
import { Page } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { formatRelative } from '@/lib/dates'

import { useConversations } from './api'

/** Your conversations with the assistant about this group, most recent first. */
export function ChatListScreen() {
  const t = useT()
  const { groupId } = useGroupScope()
  const conversations = useConversations(groupId)
  const newChat = `/groups/${groupId}/chat/new`

  return (
    <>
      <AppBar
        title={t('chat.listTitle')}
        back={`/groups/${groupId}/insights`}
        actions={
          <LinkButton to={newChat} size="sm">
            {t('chat.newChat')}
          </LinkButton>
        }
      />
      <Page width="narrow">
        {conversations.isLoading && <ListRowSkeleton count={3} />}

        {conversations.isError && (
          <ErrorState error={conversations.error} onRetry={conversations.refetch} />
        )}

        {!conversations.isLoading && !conversations.isError && conversations.items.length === 0 && (
          <EmptyState
            title={t('chat.emptyTitle')}
            body={t('chat.emptyBody')}
            action={{ label: t('chat.newChat'), to: newChat }}
          />
        )}

        {conversations.items.length > 0 && (
          <>
            <ul className="bg-surface border-line divide-line divide-y border-y">
              {conversations.items.map((conversation) => (
                <li key={conversation.id}>
                  <ListRow
                    to={`/groups/${groupId}/chat/${conversation.id}`}
                    title={<bdi>{conversation.title}</bdi>}
                    subtitle={formatRelative(conversation.last_message_at)}
                    trailing={<ChevronEnd className="size-5" />}
                  />
                </li>
              ))}
            </ul>
            <p className="text-muted px-4 py-3 text-xs">{t('chat.privateNote')}</p>
          </>
        )}

        {conversations.hasNextPage && (
          <div className="px-4 pb-4">
            <Button
              variant="secondary"
              fullWidth
              loading={conversations.isFetchingNextPage}
              onClick={conversations.fetchNextPage}
            >
              {t('common.actions.loadMore')}
            </Button>
          </div>
        )}
      </Page>
    </>
  )
}
