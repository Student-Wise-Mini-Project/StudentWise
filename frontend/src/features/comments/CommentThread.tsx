import { useState } from 'react'

import { detailOf } from '@/api/errors'
import type { Comment } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Textarea } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroupScope } from '@/features/groups/groupContext'
import { formatRelative } from '@/lib/dates'

import { useAddComment, useComments, useDeleteComment, useEditComment } from './api'

const MAX = 2000

/**
 * The conversation on an expense.
 *
 * Any group member can comment, including someone who is not on the expense --
 * "why am I not on this one?" is exactly the comment worth allowing.
 */
export function CommentThread({ expenseId }: { expenseId: string }) {
  const thread = useComments(expenseId)
  const add = useAddComment(expenseId)
  const [draft, setDraft] = useState('')

  const trimmed = draft.trim()

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted font-display text-2xs font-extrabold tracking-[0.1em] uppercase">
        {thread.total > 0 ? `Comments (${thread.total})` : 'Comments'}
      </h2>

      {thread.isLoading && <Spinner label="Loading comments" />}

      {!thread.isLoading && thread.items.length === 0 && (
        <p className="text-muted text-sm">
          Nothing said yet. Ask a question if something looks wrong.
        </p>
      )}

      <Stack gap={4}>
        {thread.items.map((comment) => (
          <CommentRow key={comment.id} comment={comment} expenseId={expenseId} />
        ))}
      </Stack>

      {thread.hasNextPage && (
        <Button variant="ghost" size="sm" onClick={thread.fetchNextPage}>
          Show earlier comments
        </Button>
      )}

      {/* Sticky, so "why am I on this one?" can be asked while the split list
       * that prompted it is still on screen. It clears the tab bar and the
       * home indicator the same way the FAB bar does. */}
      <div
        className="bg-ground border-line sticky z-10 -mx-4 mt-1 border-t px-4 pt-2.5 pb-3"
        style={{
          insetBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end))',
        }}
      >
        <Stack direction="row" gap={2} className="items-start">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a comment"
            maxLength={MAX}
            aria-label="Add a comment"
            rows={1}
            className="min-h-12"
          />
          <Button
            loading={add.isPending}
            // The API rejects a whitespace-only body, so the button says so first.
            disabled={trimmed.length === 0}
            onClick={() => add.mutate(trimmed, { onSuccess: () => setDraft('') })}
          >
            Send
          </Button>
        </Stack>
        {add.isError && (
          <p role="alert" className="text-danger mt-1.5 text-xs">
            {detailOf(add.error)}
          </p>
        )}
      </div>
    </section>
  )
}

function CommentRow({ comment, expenseId }: { comment: Comment; expenseId: string }) {
  const { user } = useAuth()
  const { isOwner } = useGroupScope()
  const edit = useEditComment(expenseId)
  const remove = useDeleteComment(expenseId)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  const mine = comment.user.id === user?.id
  // Author or a group owner: somebody has to be able to remove abuse.
  const canDelete = mine || isOwner

  return (
    <div className="flex gap-3">
      <Avatar user={comment.user} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{mine ? 'You' : comment.user.name}</span>
          <span className="text-faint text-xs">{formatRelative(comment.created_at)}</span>
          {/* `edited_at` stays null until the text actually changes, so
              re-sending identical text is not an edit and this does not lie. */}
          {comment.edited_at && <span className="text-faint text-xs">edited</span>}
        </p>

        {editing ? (
          <Stack gap={2} className="mt-1">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX}
              aria-label="Edit comment"
              rows={2}
            />
            <Stack direction="row" gap={2}>
              <Button
                size="sm"
                loading={edit.isPending}
                disabled={draft.trim().length === 0}
                onClick={() =>
                  edit.mutate(
                    { commentId: comment.id, body: draft.trim() },
                    { onSuccess: () => setEditing(false) },
                  )
                }
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        ) : (
          <p className="mt-0.5 text-base whitespace-pre-wrap">{comment.body}</p>
        )}

        {!editing && (mine || canDelete) && (
          <Stack direction="row" gap={2} className="mt-1">
            {mine && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-muted hover:text-ink text-xs font-medium"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => remove.mutate(comment.id)}
                className="text-muted hover:text-danger text-xs font-medium"
              >
                Delete
              </button>
            )}
          </Stack>
        )}
      </div>
    </div>
  )
}
