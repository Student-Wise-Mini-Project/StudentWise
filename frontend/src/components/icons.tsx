import type { SVGProps } from 'react'

/**
 * Hand-drawn icons rather than an icon package.
 *
 * The app needs about a dozen, and a library costs a dependency plus a bundle
 * for hundreds it will never use. These are all on a 24-unit grid with a 1.75
 * stroke so they sit together, and all of them are direction-neutral except
 * `ChevronEnd`, which is explicitly mirrored for right-to-left.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6"
      {...props}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </Icon>
)

export const GroupsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.3a3.2 3.2 0 0 1 0 5.9M17.5 14.8c2.1.6 3.5 2.5 3.5 5.2" />
  </Icon>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5Z" />
    <path d="M10.3 19.5a2 2 0 0 0 3.4 0" />
  </Icon>
)

export const PersonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </Icon>
)

export const ScalesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 4v16M7 20h10" />
    <path d="M4.5 7h15" />
    <path d="M2.5 13 5 7.5 7.5 13a2.6 2.6 0 0 1-5 0ZM16.5 13 19 7.5 21.5 13a2.6 2.6 0 0 1-5 0Z" />
  </Icon>
)

export const ReceiptIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21Z" />
    <path d="M9.5 8.5h5M9.5 12.5h5" />
  </Icon>
)

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
)

/**
 * A "go to" chevron, mirrored for right-to-left.
 *
 * `scale-x-[-1]` under `[dir=rtl]` rather than a second icon: the chevron points
 * the way the reader travels, and in Hebrew that is the other way.
 */
export const ChevronEnd = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} className={`size-5 rtl:-scale-x-100 ${p.className ?? ''}`}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} className={`size-6 rtl:-scale-x-100 ${p.className ?? ''}`}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
)
