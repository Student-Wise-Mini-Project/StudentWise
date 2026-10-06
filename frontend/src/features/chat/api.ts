import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { usePagedQuery } from '@/api/paged'
import { qk } from '@/api/queryKeys'
import type { Conversation, ConversationDetail, Page } from '@/api/types'
import type { Locale } from '@/i18n/types'

/**
 * The money assistant (Epic 8). Conversations are private to the person who
 * started them, so none of this is shared with the rest of the group's cache
 * beyond living under its key.
 *
 * Sending a message returns the whole conversation, which simply replaces the
 * cached one -- there is no merging of a reply into a list to get wrong.
 */
export function useConversations(groupId: string) {
  return usePagedQuery<Conversation>({
    queryKey: qk.groups.conversations(groupId),
    limit: 20,
    fetchPage: ({ limit, offset, signal }) =>
      unwrap<Page<Conversation>>(
        api.GET('/api/groups/{group_id}/chat/conversations', {
          params: { path: { group_id: groupId }, query: { limit, offset } },
          signal,
        }),
      ),
  })
}

export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: qk.chat.detail(conversationId ?? 'new'),
    enabled: Boolean(conversationId),
    queryFn: ({ signal }) =>
      unwrap<ConversationDetail>(
        api.GET('/api/chat/conversations/{conversation_id}', {
          params: { path: { conversation_id: conversationId! } },
          signal,
        }),
      ),
  })
}

type Send = { message: string; language: Locale }

export function useStartConversation(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ message, language }: Send) =>
      unwrap<ConversationDetail>(
        api.POST('/api/groups/{group_id}/chat/conversations', {
          params: { path: { group_id: groupId } },
          body: { message, language },
        }),
      ),
    onSuccess: (conversation) => {
      queryClient.setQueryData(qk.chat.detail(conversation.id), conversation)
      void queryClient.invalidateQueries({ queryKey: qk.groups.conversations(groupId) })
    },
  })
}

export function useSendMessage(groupId: string, conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ message, language }: Send) =>
      unwrap<ConversationDetail>(
        api.POST('/api/chat/conversations/{conversation_id}/messages', {
          params: { path: { conversation_id: conversationId } },
          body: { message, language },
        }),
      ),
    onSuccess: (conversation) => {
      queryClient.setQueryData(qk.chat.detail(conversationId), conversation)
      void queryClient.invalidateQueries({ queryKey: qk.groups.conversations(groupId) })
    },
  })
}

export function useDeleteConversation(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      unwrap<void>(
        api.DELETE('/api/chat/conversations/{conversation_id}', {
          params: { path: { conversation_id: conversationId } },
        }),
      ),
    // The deleted conversation's own cache entry is left to expire. Removing it
    // here, while its screen is still mounted, makes that screen fetch it again
    // -- a 404 -- in the moment before it navigates away.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.conversations(groupId) })
    },
  })
}
