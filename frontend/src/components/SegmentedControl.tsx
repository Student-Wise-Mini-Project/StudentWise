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
      className={cn(
        'bg-sunken border-line flex w-full gap-[3px] rounded-md border p-[3px]',
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value
        return (
          <label
            key={segment.value}
            className={cn(
              'font-display flex-1 cursor-pointer rounded-sm px-2 py-2 text-center text-sm transition-colors',
              'has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2',
              // The thumb is a filled accent block, not a raised white tile.
              // Nothing that does not move carries a shadow in this identity.
              selected
                ? 'bg-accent text-on-accent font-extrabold'
                : 'text-muted hover:text-ink font-bold',
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
