import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The inverted block that carries the number the screen is about.
 *
 * There is **exactly one per screen**, and nothing else in the app is inverted.
 * That is the whole hierarchy: everything else on the screen is a flat surface
 * separated by hairlines, so the one dark block is unmissable at arm's length
 * without needing to be big, loud or animated.
 *
 * It stays dark in both themes (`--sw-slab`), so the money headline reads
 * identically day or night -- a slab that inverted with the theme would be a
 * white block on a dark screen, which is the opposite of the intent. Money on it
 * uses `--sw-slab-credit` / `--sw-slab-debt`, which are the dark-theme money
 * colours in both themes for the same reason.
 *
 * Full-bleed on a phone and squared off, like a stamp across the page.
 */
export function Slab({
  eyebrow,
  children,
  className,
}: {
  eyebrow: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('bg-slab text-on-slab px-4 py-5 sm:rounded-sm', className)}>
      <h2 className="font-display text-2xs text-faint font-extrabold tracking-[0.12em] uppercase">
        {eyebrow}
      </h2>
      {children}
    </section>
  )
}

/** A bordered cell inside a slab. On a slab, a hairline is `line-strong`. */
export function SlabChip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="border-line-strong block min-w-0 rounded-sm border px-2.5 py-2">
      <span className="text-faint block truncate text-xs">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </span>
  )
}
