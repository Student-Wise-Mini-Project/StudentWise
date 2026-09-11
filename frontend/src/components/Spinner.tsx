import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'

const SIZES = { sm: 'size-4 border-2', md: 'size-5 border-2', lg: 'size-8 border-[3px]' } as const

export function Spinner({
  size = 'md',
  label,
  className,
}: {
  size?: keyof typeof SIZES
  label?: string
  className?: string
}) {
  const t = useT()

  return (
    <span
      role="status"
      aria-label={label ?? t('common.actions.loading')}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-e-transparent align-[-0.125em]',
        SIZES[size],
        className,
      )}
    />
  )
}
