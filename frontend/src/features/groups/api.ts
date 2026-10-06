import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { invalidateMembership } from '@/api/invalidate'
import { qk } from '@/api/queryKeys'
import type { Group, GroupType, UserSearchResult } from '@/api/types'

export function useGroups() {
  return useQuery({
    queryKey: qk.groups.list(),
    queryFn: ({ signal }) => unwrap<Group[]>(api.GET('/api/groups', { signal })),
  })
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.groups.detail(groupId ?? ''),
    enabled: Boolean(groupId),
    queryFn: ({ signal }) =>
      unwrap<Group>(
        api.GET('/api/groups/{group_id}', {
          params: { path: { group_id: groupId as string } },
          signal,
        }),
      ),
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; type: GroupType; currency?: string }) =>
      unwrap<Group>(
        api.POST('/api/groups', {
          // `currency` is sent explicitly even though the server defaults it.
          //
          // The generated types mark any field with a default as required --
          // `openapi-typescript` keeps `--default-non-nullable` on, which makes
          // response types accurate (`currency` really is always present on a
          // group) at the cost of request bodies looking stricter than the API
          // is. Turning it off to loosen the request would make every defaulted
          // field optional in responses too, and that is the worse trade: it
          // would mean null-checking data that always exists.
          body: { ...input, currency: input.currency ?? 'ILS' },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.list() })
    },
  })
}

export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; currency?: string; address?: string }) =>
      unwrap<Group>(
        api.PATCH('/api/groups/{group_id}', {
          params: { path: { group_id: groupId } },
          body: input,
        }),
      ),
    onSuccess: () => invalidateMembership(queryClient, groupId),
  })
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) =>
      unwrap<void>(
        api.DELETE('/api/groups/{group_id}', { params: { path: { group_id: groupId } } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.all() })
    },
  })
}

/**
 * Close a group, and reopen it.
 *
 * Both invalidate the whole `groups` tree rather than the one group. Closing
 * moves a group between two sections of the list and changes whether the `+`
 * bar offers it at all, so the list is exactly as stale as the group itself.
 *
 * Closing is allowed while balances are outstanding -- the confirm sheet names
 * what is still owed and the decision stays with the person. Settlements keep
 * working on a closed group, so that debt can still be paid off.
 */
export function useCloseGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) =>
      unwrap<Group>(
        api.POST('/api/groups/{group_id}/close', { params: { path: { group_id: groupId } } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.all() })
    },
  })
}

export function useReopenGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) =>
      unwrap<Group>(
        api.POST('/api/groups/{group_id}/reopen', { params: { path: { group_id: groupId } } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.all() })
    },
  })
}

/**
 * Find someone to add to a group.
 *
 * The backend requires at least three characters, so the query is disabled below
 * that rather than firing a request it knows will be refused.
 */
export function useUserSearch(fragment: string) {
  const trimmed = fragment.trim()
  return useQuery({
    queryKey: qk.users.search(trimmed),
    enabled: trimmed.length >= 3,
    queryFn: ({ signal }) =>
      unwrap<UserSearchResult[]>(
        api.GET('/api/users/search', { params: { query: { email: trimmed } }, signal }),
      ),
  })
}

export function useAddMember(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email?: string; user_id?: string; default_split_weight?: string }) =>
      unwrap(
        api.POST('/api/groups/{group_id}/members', {
          params: { path: { group_id: groupId } },
          // Same reason as `currency` above. A weight is sent as a string, like
          // every other decimal in this app.
          body: { ...input, default_split_weight: input.default_split_weight ?? '1' },
        }),
      ),
    onSuccess: () => invalidateMembership(queryClient, groupId),
  })
}

/**
 * Add a member to a group whose id was not known when the component rendered.
 *
 * `useAddMember` binds its group at hook time, which the create-group sheet
 * cannot do -- the group it is adding to does not exist until the moment
 * before. This returns a plain async function instead, so the sheet can await
 * one add per person and count the failures honestly.
 */
export function useAddMemberToNewGroup() {
  const queryClient = useQueryClient()
  return async function addMemberTo(groupId: string, userId: string) {
    await unwrap(
      api.POST('/api/groups/{group_id}/members', {
        params: { path: { group_id: groupId } },
        body: { user_id: userId, default_split_weight: '1' },
      }),
    )
    invalidateMembership(queryClient, groupId)
  }
}

export function useUpdateMemberWeight(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; weight: string }) =>
      unwrap(
        api.PATCH('/api/groups/{group_id}/members/{user_id}', {
          params: { path: { group_id: groupId, user_id: input.userId } },
          body: { default_split_weight: input.weight },
        }),
      ),
    onSuccess: () => invalidateMembership(queryClient, groupId),
  })
}

export function useRemoveMember(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.DELETE('/api/groups/{group_id}/members/{user_id}', {
          params: { path: { group_id: groupId, user_id: userId } },
        }),
      ),
    // Removing someone sets `left_at`; it does not delete their history, and
    // their balance stays until it is settled. So the ledger is invalidated too,
    // not just the membership list.
    onSuccess: () => invalidateMembership(queryClient, groupId),
  })
}
