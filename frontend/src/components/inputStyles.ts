import { cn } from '@/lib/cn'

/**
 * The shared look of every text-like control.
 *
 * In its own file rather than exported from `Input.tsx` so that file exports
 * only components and fast refresh keeps working -- editing a component should
 * not reload the page and lose the form you were half way through.
 *
 * The 44px height is Apple's minimum comfortable touch target. This app is
 * operated with one thumb in a supermarket queue, so it is a floor, not a
 * suggestion.
 */
export const inputClasses = cn(
  'bg-surface border-line text-ink placeholder:text-faint w-full rounded-lg border',
  'h-11 px-3 text-base transition-colors',
  'focus:border-accent focus:outline-none',
  'aria-[invalid]:border-danger',
  'disabled:bg-sunken disabled:text-muted disabled:cursor-not-allowed',
)
