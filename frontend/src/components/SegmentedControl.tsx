import { cn } from '@/lib/cn'

export type Segment<T extends string> = { value: T; label: string }

/**
 * A small set of mutually exclusive choices, shown all at once.
 *
 * Used for the split-type switch, where a dropdown would hide three of the four
 * options behind a tap and make "how is this split?" feel like a settings
 * screen. Rendered as real radios so arrow keys work and a screen reader
 * announces "2 of 4".
 */
export function SegmentedControl<T extends string>({
  name,
  value,
  onChange,
  segments,
  className,
}: {
  name: string
  value: T
  onChange: (value: T) => void
  segments: readonly Segment<T>[]
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn('bg-sunken flex w-full gap-0.5 rounded-lg p-0.5', className)}
    >
      {segments.map((segment) => {
        const selected = segment.value === value
        return (
          <label
            key={segment.value}
            className={cn(
              'flex-1 cursor-pointer rounded-md px-2 py-2 text-center text-sm font-semibold transition-colors',
              'has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2',
              selected ? 'bg-surface text-ink shadow-raised' : 'text-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={segment.value}
              checked={selected}
              onChange={() => onChange(segment.value)}
              className="sr-only"
            />
            {segment.label}
          </label>
        )
      })}
    </div>
  )
}
