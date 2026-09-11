import { cn } from '@/lib/cn'

/**
 * The shared look of every text-like control.
 *
 * In its own file rather than exported from `Input.tsx` so that file exports
 * only components and fast refresh keeps working -- editing a component should
 * not reload the page and lose the form you were half way through.
 *
 * 48px clears Apple's 44px minimum comfortable touch target with room to spare.
 * This app is operated with one thumb in a supermarket queue, so that is a
 * floor, not a suggestion.
 */
export const inputClasses = cn(
  'bg-surface border-line-strong text-ink placeholder:text-faint w-full rounded-md border',
  'h-12 px-3.5 text-base transition-colors',
  'focus:border-accent focus:outline-none',
  'aria-[invalid]:border-danger aria-[invalid]:bg-danger-soft',
  'disabled:bg-sunken disabled:text-muted disabled:cursor-not-allowed',
)
