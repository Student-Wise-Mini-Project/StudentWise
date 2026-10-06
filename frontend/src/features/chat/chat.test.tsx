import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { ConversationDetail, Group } from '@/api/types'
import { GroupContext } from '@/features/groups/groupContext'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/types'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { ChatListScreen } from './ChatListScreen'
import { ChatScreen } from './ChatScreen'

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  address: null,
  created_by: 'u-gal',
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  members: [],
} as unknown as Group

const message = (
  id: string,
  role: 'USER' | 'ASSISTANT',
  content: string,
  tools: string[] = [],
) => ({
  id,
  role,
  content,
  tools_used: tools.map((name) => ({ name, input: {} })),
  created_at: '2026-10-06T10:00:00Z',
})

const CONVERSATION: ConversationDetail = {
  id: 'c1',
  group_id: 'g1',
  title: 'Who owes whom?',
  created_at: '2026-10-06T10:00:00Z',
  last_message_at: '2026-10-06T10:00:00Z',
  messages: [
    message('m1', 'USER', 'Who owes whom?'),
    message('m2', 'ASSISTANT', 'Noa owes Maya ₪727.97.\n- You owe Maya ₪1,151.91', ['balances']),
  ],
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function renderAt(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider locale={locale}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <GroupContext
            value={{
              group: GROUP,
              groupId: 'g1',
              currency: 'ILS',
              activeMembers: [],
              allMembers: [],
              me: undefined,
              isOwner: true,
              isOpen: true,
            }}
          >
            <Routes>
              <Route path="/groups/:groupId/chat" element={<ChatListScreen />} />
              <Route path="/groups/:groupId/chat/:conversationId" element={<ChatScreen />} />
            </Routes>
            <Where />
          </GroupContext>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

type Sent = { message: string; language: string }

function starting(respond: (body: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = []
  server.use(
    http.post(apiUrl('/api/groups/g1/chat/conversations'), async ({ request }) => {
      const body = (await request.json()) as Sent
      sent.push(body)
      return respond(body)
    }),
    http.get(apiUrl('/api/chat/conversations/c1'), () => HttpResponse.json(CONVERSATION)),
  )
  return sent
}

describe('the list of conversations', () => {
  it('shows yours, each linking to its thread', async () => {
    server.use(
      http.get(apiUrl('/api/groups/g1/chat/conversations'), () =>
        HttpResponse.json({
          items: [CONVERSATION],
          total: 1,
          limit: 20,
          offset: 0,
          has_more: false,
        }),
      ),
    )
    renderAt('/groups/g1/chat')
    const row = await screen.findByRole('link', { name: /Who owes whom\?/ })
    expect(row).toHaveAttribute('href', '/groups/g1/chat/c1')
    expect(screen.getByText('Only you can see your conversations.')).toBeInTheDocument()
  })

  it('with none yet, says what the assistant is for and offers to start', async () => {
    server.use(
      http.get(apiUrl('/api/groups/g1/chat/conversations'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0, has_more: false }),
      ),
    )
    renderAt('/groups/g1/chat')
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument()
    const start = screen.getAllByRole('link', { name: 'New conversation' })
    expect(start.every((link) => link.getAttribute('href') === '/groups/g1/chat/new')).toBe(true)
  })
})

describe('a new conversation', () => {
  it('a suggestion asks it, the answer shows, and the address becomes the conversation', async () => {
    const sent = starting(() => HttpResponse.json(CONVERSATION, { status: 201 }))
    renderAt('/groups/g1/chat/new')

    expect(screen.getByText(/the assistant only reads/)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Who owes whom, and how do we settle up?' }),
    )

    expect(await screen.findByText(/Noa owes Maya ₪727\.97/)).toBeInTheDocument()
    expect(sent).toEqual([{ message: 'Who owes whom, and how do we settle up?', language: 'en' }])
    expect(screen.getByText('Looked at balances')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/groups/g1/chat/c1'))
  })

  it('shows the question at once and says it is working while it waits', async () => {
    starting(async () => {
      await delay(50)
      return HttpResponse.json(CONVERSATION, { status: 201 })
    })
    renderAt('/groups/g1/chat/new')
    await userEvent.type(screen.getByLabelText('Your message'), 'Where does it all go?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText('Where does it all go?')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Looking at your numbers…' })).toBeInTheDocument()
    expect(await screen.findByText(/Noa owes Maya/)).toBeInTheDocument()
  })

  it('asks for the answer in the language the app is shown in', async () => {
    const sent = starting(() => HttpResponse.json(CONVERSATION, { status: 201 }))
    renderAt('/groups/g1/chat/new', 'he')
    await userEvent.type(screen.getByLabelText('ההודעה'), 'מי חייב למי?')
    await userEvent.click(screen.getByRole('button', { name: 'שליחה' }))
    await waitFor(() => expect(sent).toEqual([{ message: 'מי חייב למי?', language: 'he' }]))
  })

  it('when it fails, keeps the question so it can be sent again', async () => {
    let attempts = 0
    starting(() => {
      attempts += 1
      return attempts === 1
        ? HttpResponse.json({ detail: 'The assistant is busy.' }, { status: 503 })
        : HttpResponse.json(CONVERSATION, { status: 201 })
    })
    renderAt('/groups/g1/chat/new')
    await userEvent.type(screen.getByLabelText('Your message'), 'Who owes whom?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("The assistant isn't available right now.")
    expect(alert).toHaveTextContent('Who owes whom?')
    expect(screen.getByLabelText('Your message')).toHaveValue('Who owes whom?')

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Noa owes Maya/)).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('will not send an empty message', () => {
    renderAt('/groups/g1/chat/new')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})

describe('an existing conversation', () => {
  it('shows the thread and sends a follow-up to it', async () => {
    const sent: Sent[] = []
    server.use(
      http.get(apiUrl('/api/chat/conversations/c1'), () => HttpResponse.json(CONVERSATION)),
      http.post(apiUrl('/api/chat/conversations/c1/messages'), async ({ request }) => {
        sent.push((await request.json()) as Sent)
        return HttpResponse.json({
          ...CONVERSATION,
          messages: [
            ...CONVERSATION.messages,
            message('m3', 'USER', 'And Noa?'),
            message('m4', 'ASSISTANT', 'Noa owes ₪727.97.', ['balances', 'query_database']),
          ],
        })
      }),
    )
    renderAt('/groups/g1/chat/c1')

    expect(await screen.findByText(/You owe Maya ₪1,151\.91/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Your message'), 'And Noa?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Noa owes ₪727.97.')).toBeInTheDocument()
    expect(sent).toEqual([{ message: 'And Noa?', language: 'en' }])
    expect(screen.getByText('Looked at balances · a database query')).toBeInTheDocument()
  })

  it('names a tool it does not know generically, rather than showing its code', async () => {
    server.use(
      http.get(apiUrl('/api/chat/conversations/c1'), () =>
        HttpResponse.json({
          ...CONVERSATION,
          messages: [message('m2', 'ASSISTANT', 'Hello.', ['some_future_tool'])],
        }),
      ),
    )
    renderAt('/groups/g1/chat/c1')
    expect(await screen.findByText('Looked at your data')).toBeInTheDocument()
  })

  it('can be deleted, after a confirmation', async () => {
    let deleted = false
    server.use(
      http.get(apiUrl('/api/chat/conversations/c1'), () => HttpResponse.json(CONVERSATION)),
      http.delete(apiUrl('/api/chat/conversations/c1'), () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(apiUrl('/api/groups/g1/chat/conversations'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0, has_more: false }),
      ),
    )
    renderAt('/groups/g1/chat/c1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this conversation' }))
    expect(deleted).toBe(false)

    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/\/groups\/g1\/chat$/),
    )
    expect(deleted).toBe(true)
  })
})
