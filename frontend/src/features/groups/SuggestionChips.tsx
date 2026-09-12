import { Avatar } from '@/components/Avatar'
import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'

import type { Suggestion } from './suggestions'

/**
 * The people you already split with, as a row of tappable chips.
 *
 * Renders nothing at all when there is nobody to suggest, so somebody creating
 * their very first group does not meet an empty labelled box. The email field
 * beside it stays the way to reach anyone new.
 */
export function SuggestionChips({
  suggestions,
  selected,
  onToggle,
}: {
  suggestions: Suggestion[]
  selected: string[]
  onToggle: (userId: string) => void
}) {
  const t = useT()

  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map(({ user, sharedGroups }) => {
        const on = selected.includes(user.id)
        return (
          <button
            key={user.id}
            type="button"
            // aria-pressed, not a checkbox: this is a toggle on a control that
            // already reads as a button, and a screen reader should say so.
            aria-pressed={on}
            onClick={() => onToggle(user.id)}
            title={t('groups.suggestions.shared', { count: sharedGroups })}
            className={cn(
              'flex items-center gap-2 rounded-full border py-1.5 ps-1.5 pe-3.5 text-sm font-semibold transition-colors',
              on
                ? 'bg-accent text-on-accent border-accent'
                : 'bg-surface text-ink border-line-strong hover:bg-sunken',
            )}
          >
            <Avatar user={user} size="sm" />
            {user.name}
          </button>
        )
      })}
    </div>
  )
}
