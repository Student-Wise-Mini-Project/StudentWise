import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/cn'

import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-surface text-ink border-line-strong border hover:bg-sunken active:bg-sunken',
  ghost: 'bg-transparent text-ink hover:bg-sunken active:bg-sunken',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-on-accent',
}

const SIZES: Record<ButtonSize, string> = {
  // 44px is Apple's minimum comfortable touch target, and this app is used
  // one-handed on a phone. `md` is deliberately at it rather than near it.
  sm: 'h-9 px-3.5 text-sm rounded-sm gap-1.5',
  md: 'h-11 px-4.5 text-base rounded-md gap-2',
  lg: 'h-13 px-5.5 text-lg rounded-lg gap-2',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  iconStart,
  iconEnd,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      // Tells a screen reader the button is working, without swapping its label
      // for a spinner and losing what it does.
      aria-busy={loading || undefined}
      className={cn(
        'font-display inline-flex items-center justify-center font-bold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : iconStart}
      {children}
      {!loading && iconEnd}
    </button>
  )
}

/**
 * A link that looks like a button.
 *
 * Not a `<button onClick={navigate}>`: a destination must be a real anchor, so
 * middle-click, long-press and "open in new tab" work, and so a screen reader
 * announces it as a link rather than a control.
 */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cn(
        'font-display inline-flex items-center justify-center font-bold transition-colors',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </Link>
  )
}

/**
 * A link out of the app that looks like a button -- to an app store, say.
 *
 * A new tab, so an installed PWA is not navigated away from itself when the
 * phone does not hand the address straight to another app.
 */
export function ExternalLinkButton({
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
}: {
  href: string
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'font-display inline-flex items-center justify-center font-bold transition-colors',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </a>
  )
}
