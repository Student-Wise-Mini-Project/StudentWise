import { type ReactNode, useEffect, useId, useRef } from 'react'

import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'

/**
 * One component, two presentations: a bottom sheet on a phone, a centred dialog
 * on a desktop.
 *
 * Built on the native `<dialog>` element, which brings a focus trap, `inert` on
 * the background, Escape-to-close and top-layer stacking for free. Every one of
 * those is a bug waiting to happen in a hand-rolled modal, and the focus trap in
 * particular is the difference between usable and unusable with a keyboard.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  // Per instance: a screen with two sheets (pay, then record) would otherwise
  // have two elements with one id, and a dialog named after the wrong title.
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // `cancel` is Escape; without preventing the default the dialog closes
      // itself and React's `open` prop is then out of step with reality.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby={titleId}
      className={cn(
        'bg-surface text-ink m-0 w-full max-w-none p-0 backdrop:backdrop-blur-[2px]',
        // Phone: pinned to the bottom, clearing the home indicator. The radius
        // is on the leading edge only, and logical so it mirrors for Hebrew.
        'mt-auto max-h-[90dvh] rounded-ss-2xl rounded-se-2xl',
        // Desktop: a centred dialog with a max width.
        'sm:m-auto sm:max-w-md sm:rounded-lg',
        'shadow-sheet',
        className,
      )}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="border-line flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.actions.close')}
            className="text-muted hover:bg-sunken hover:text-ink -me-1 shrink-0 rounded-md p-1.5 transition-colors"
          >
            <svg
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <footer
            className="border-line flex gap-2 border-t px-4 py-3"
            style={{ paddingBlockEnd: 'max(0.75rem, var(--sw-safe-block-end))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
