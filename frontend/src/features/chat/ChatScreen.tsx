import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ApiError, detailOf } from '@/api/errors'
import type { ChatMessage, ToolUse } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { ErrorState, Skeleton } from '@/components/feedback'
import { Page, Stack } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { type MessageKey } from '@/i18n/messages'
import { useLocale, useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'

import { useConversation, useDeleteConversation, useSendMessage, useStartConversation } from './api'

const SUGGESTIONS = [
  'chat.suggestions.s1',
  'chat.suggestions.s2',
  'chat.suggestions.s3',
  'chat.suggestions.s4',
] as const

const TOOL_NAMES: Record<string, MessageKey> = {
  spending_summary: 'chat.tools.spending_summary',
  spending_by_category: 'chat.tools.spending_by_category',
  spending_by_month: 'chat.tools.spending_by_month',
  spending_by_member: 'chat.tools.spending_by_member',
  balances: 'chat.tools.balances',
  unusual_expenses: 'chat.tools.unusual_expenses',
  possible_duplicates: 'chat.tools.possible_duplicates',
  list_expenses: 'chat.tools.list_expenses',
  query_database: 'chat.tools.query_database',
}

/**
 * Epic 8: a conversation with the money assistant about one group.
 *
 * `/chat/new` has no conversation yet; the first answer creates one and the
 * address is replaced with its own, so the back button never returns to an
 * empty "new" screen.
 *
 * Nothing is saved unless an answer comes back. A question that fails stays on
 * screen with "Try again", and its text goes back into the box -- typing a long
 * question twice on a phone is the failure worth designing out.
 */
export function ChatScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { locale } = useLocale()
  const { groupId } = useGroupScope()
  const { conversationId } = useParams()
  const isNew = conversationId === 'new'
  const id = isNew ? undefined : conversationId

  const conversation = useConversation(id)
  const start = useStartConversation(groupId)
  const send = useSendMessage(groupId, id ?? '')
  const remove = useDeleteConversation(groupId)
  const busy = start.isPending || send.isPending

  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ question: string; error: unknown } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const messages = conversation.data?.messages ?? []

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, pending, failed])

  function submit(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setPending(question)
    setFailed(null)
    setDraft('')

    const handlers = {
      onSuccess: (result: { id: string }) => {
        setPending(null)
        if (isNew) navigate(`/groups/${groupId}/chat/${result.id}`, { replace: true })
      },
      onError: (error: unknown) => {
        setPending(null)
        setFailed({ question, error })
        setDraft(question)
      },
    }
    const body = { message: question, language: locale }
    if (isNew) start.mutate(body, handlers)
    else send.mutate(body, handlers)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(draft)
  }

  const empty = messages.length === 0 && !pending && !failed

  return (
    <>
      <AppBar
        title={conversation.data ? <bdi>{conversation.data.title}</bdi> : t('chat.newChat')}
        back={`/groups/${groupId}/chat`}
        actions={
          id && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('chat.deleteAria')}
              onClick={() => setConfirming(true)}
            >
              {t('chat.delete')}
            </Button>
          )
        }
      />
      <Page width="narrow" padded>
        <Stack gap={3} className="py-4">
          {id && conversation.isLoading && <Skeleton className="h-24" />}
          {id && conversation.isError && (
            <ErrorState error={conversation.error} onRetry={() => void conversation.refetch()} />
          )}

          {isNew && empty && (
            <>
              <p className="text-muted text-sm">{t('chat.intro')}</p>
              <div className="flex flex-col gap-2">
                <span className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
                  {t('chat.suggestionsLabel')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => submit(t(key))}
                      className="border-line text-ink hover:bg-sunken rounded-sm border px-3 py-1.5 text-start text-sm transition-colors"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}

          {pending && (
            <>
              <Bubble message={{ role: 'USER', content: pending, tools_used: [] }} />
              <div className="text-muted flex items-center gap-2 self-start text-sm">
                <Spinner size="sm" label={t('chat.thinking')} />
                <span>{t('chat.thinking')}</span>
              </div>
            </>
          )}

          {failed && (
            <div role="alert" className="bg-danger-soft flex flex-col gap-2 rounded-sm p-3 text-sm">
              <span className="text-danger">
                {failed.error instanceof ApiError && failed.error.status === 503
                  ? t('chat.unavailable')
                  : detailOf(failed.error)}
              </span>
              <span className="text-muted">
                {t('chat.failedQuestion')} <bdi>{failed.question}</bdi>
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => submit(failed.question)}
              >
                {t('common.actions.retry')}
              </Button>
            </div>
          )}

          <div ref={end} />
        </Stack>
      </Page>

      {/* Above the tab bar on a phone, where the add-expense bar sits on other
       * screens -- the shell already leaves room for it. */}
      <form
        onSubmit={onSubmit}
        className="bg-ground/95 border-line fixed inset-x-0 bottom-[calc(var(--sw-tabbar-height)+var(--sw-safe-block-end))] z-20 border-t backdrop-blur-md lg:bottom-[var(--sw-safe-block-end)]"
      >
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-3">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            dir="auto"
            aria-label={t('chat.inputAria')}
            placeholder={t('chat.placeholder')}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={!draft.trim() || busy} loading={busy}>
            {t('common.actions.send')}
          </Button>
        </div>
      </form>

      {id && (
        <Sheet
          open={confirming}
          onClose={() => setConfirming(false)}
          title={t('chat.confirmTitle')}
          description={t('chat.confirmBody')}
          footer={
            <>
              <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
                {t('chat.confirmKeep')}
              </Button>
              <Button
                variant="danger"
                fullWidth
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(id, {
                    onSuccess: () => navigate(`/groups/${groupId}/chat`, { replace: true }),
                  })
                }
              >
                {t('common.actions.delete')}
              </Button>
            </>
          }
        >
          {remove.isError ? (
            <p role="alert" className="text-danger text-sm">
              {detailOf(remove.error)}
            </p>
          ) : (
            <span />
          )}
        </Sheet>
      )}
    </>
  )
}

function Bubble({
  message,
}: {
  message: Pick<ChatMessage, 'role' | 'content'> & { tools_used: ToolUse[] }
}) {
  const t = useT()
  const mine = message.role === 'USER'
  const tools = [...new Set(message.tools_used.map((tool) => tool.name))]

  return (
    <div className={cn('flex max-w-[85%] flex-col gap-1', mine ? 'self-end' : 'self-start')}>
      <span className="sr-only">{mine ? t('chat.youSaid') : t('chat.assistantSaid')}</span>
      <p
        dir="auto"
        className={cn(
          'rounded-md px-3.5 py-2.5 text-sm whitespace-pre-line',
          mine ? 'bg-accent text-on-accent' : 'bg-surface border-line text-ink border',
        )}
      >
        {message.content}
      </p>
      {tools.length > 0 && (
        <span className="text-muted px-1 text-xs">
          {t('chat.lookedAt', {
            tools: tools.map((name) => t(TOOL_NAMES[name] ?? 'chat.tools.unknown')).join(' · '),
          })}
        </span>
      )}
    </div>
  )
}
