import { cn } from '@/lib/cn'

/**
 * Squares, not circles. People are chips in a ledger here, not profile pictures
 * -- a round avatar is the single loudest "app" signal there is, and this one is
 * meant to read as a printed ticket.
 */
const SIZES = {
  xs: 'size-6 text-2xs rounded-sm',
  sm: 'size-8 text-xs rounded-sm',
  md: 'size-10 text-sm rounded-md',
  lg: 'size-14 text-lg rounded-md',
} as const

/** Six avatar tokens, chosen from `theme.css`. No colour is named here. */
const AVATAR_TOKENS = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const

/** Stable per user, so the same person is the same colour on every screen. */
function tokenFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_TOKENS[hash % AVATAR_TOKENS.length] ?? AVATAR_TOKENS[0]
}

/**
 * One letter for one name, two for two.
 *
 * "Gal" as "GA" reads as a word that ran out of room; as "G" it reads as a
 * monogram, which is what a chip in a ledger is. Most people in this app are
 * entered under a single first name, so the one-word case is the common one,
 * not the edge case.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = firstLetter(parts[0])
  return parts.length === 1 ? first : `${first}${firstLetter(parts.at(-1))}`
}

/** Code points, not characters: `[0]` alone can split a surrogate pair in half. */
function firstLetter(part: string | undefined): string {
  return part ? ([...part][0] ?? '').toUpperCase() : ''
}

export type AvatarProps = {
  user: { id: string; name: string }
  size?: keyof typeof SIZES
  className?: string
}

export function Avatar({ user, size = 'md', className }: AvatarProps) {
  return (
    <span
      // The name is already next to this in every list row, so repeating it to a
      // screen reader is noise.
      aria-hidden="true"
      title={user.name}
      className={cn(
        'text-on-avatar font-display inline-flex shrink-0 items-center justify-center font-extrabold select-none',
        tokenFor(user.id),
        SIZES[size],
        className,
      )}
    >
      {initials(user.name)}
    </span>
  )
}

export function AvatarStack({
  users,
  max = 4,
  size = 'sm',
  className,
}: {
  users: { id: string; name: string }[]
  max?: number
  size?: keyof typeof SIZES
  className?: string
}) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length

  return (
    <span className={cn('flex items-center', className)}>
      {shown.map((user, index) => (
        <Avatar
          key={user.id}
          user={user}
          size={size}
          className={cn('ring-surface ring-2', index > 0 && '-ms-2')}
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'bg-sunken text-muted ring-surface font-display -ms-2 inline-flex items-center justify-center font-extrabold ring-2',
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
      <span className="sr-only">{users.map((user) => user.name).join(', ')}</span>
    </span>
  )
}
