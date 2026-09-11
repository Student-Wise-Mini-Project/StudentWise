import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting a caller's class win over a component's default.
 *
 * Without `twMerge`, `<Button className="bg-surface">` produces
 * `bg-accent bg-surface` and whichever Tailwind emitted last wins -- which is
 * not the one the caller wrote. That is the bug that makes people give up on
 * component props and start copying markup.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
