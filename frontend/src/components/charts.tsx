import { cn } from '@/lib/cn'

/**
 * Small, hand-drawn charts.
 *
 * No charting library on purpose. Three charts is not enough to earn a
 * dependency, a library's default palette would fight the rule that only
 * `styles/theme.css` may name a colour, and stock charts look like stock charts.
 *
 * **Geometry is pixels, not money.** These take `number`s for anything that
 * decides a coordinate, and every *label* is passed in already formatted from
 * the original decimal string. No amount is ever reconstructed from a pixel.
 *
 * Each chart carries a screen-reader table, because a shape is not a number to
 * anyone who cannot see it.
 */

/** The six palette slots, in order. Defined in theme.css; named nowhere else. */
const SLICE_FILLS = [
  'fill-avatar-1',
  'fill-avatar-2',
  'fill-avatar-3',
  'fill-avatar-4',
  'fill-avatar-5',
  'fill-avatar-6',
] as const

const SLICE_SWATCHES = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const

export type DonutSlice = {
  key: string
  label: string
  /** For the geometry only. */
  share: number
  /** Already formatted. */
  amount: string
  caption: string
}

/**
 * A donut, not a pie: the hole is where the total goes, which is the number
 * people actually want and would otherwise need a second glance to find.
 */
export function DonutChart({
  slices,
  total,
  totalLabel,
  className,
}: {
  slices: DonutSlice[]
  total: string
  totalLabel: string
  className?: string
}) {
  const size = 180
  const centre = size / 2
  const radius = 74
  const thickness = 26

  // Cumulative offsets computed up front rather than accumulated inside the map:
  // a running variable mutated during render is the kind of thing that works
  // until something renders twice.
  const START = -Math.PI / 2 // twelve o'clock
  const sweeps = slices.map((slice) => (slice.share / 100) * Math.PI * 2)
  const offsets = sweeps.reduce<number[]>(
    (acc, sweep, index) => [...acc, (acc[index] ?? START) + sweep],
    [START],
  )

  const arcs = slices.map((slice, index) => ({
    slice,
    path: donutArc(
      centre,
      centre,
      radius,
      thickness,
      offsets[index] ?? START,
      (offsets[index] ?? START) + (sweeps[index] ?? 0),
    ),
    fill: SLICE_FILLS[index % SLICE_FILLS.length] ?? SLICE_FILLS[0],
  }))

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="size-44"
          role="img"
          aria-label={`Spending by category. Total ${total}.`}
        >
          {arcs.map(({ slice, path, fill }) => (
            <path key={slice.key} d={path} className={fill} />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-muted text-2xs font-semibold tracking-wide uppercase">
            {totalLabel}
          </span>
          <span className="font-display tnum amount text-xl font-extrabold">{total}</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {arcs.map(({ slice }, index) => (
          <li key={slice.key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'size-2.5 shrink-0 rounded-sm',
                SLICE_SWATCHES[index % SLICE_SWATCHES.length],
              )}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{slice.label}</span>
            <span className="text-muted tnum amount text-xs">{slice.caption}</span>
            <span className="tnum amount text-sm font-semibold">{slice.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** An annular sector. Two arcs and two straight edges, closed. */
function donutArc(
  cx: number,
  cy: number,
  outer: number,
  thickness: number,
  from: number,
  to: number,
): string {
  const inner = outer - thickness
  // A full circle cannot be drawn as one arc: the start and end points coincide
  // and the renderer draws nothing at all.
  const sweep = Math.min(to - from, Math.PI * 2 - 0.0001)
  const end = from + sweep
  const large = sweep > Math.PI ? 1 : 0

  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`

  return [
    `M ${p(outer, from)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p(outer, end)}`,
    `L ${p(inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p(inner, from)}`,
    'Z',
  ].join(' ')
}

export type TrendPoint = {
  key: string
  /** Short x-axis label, e.g. "Sep". */
  label: string
  /** Geometry only. */
  value: number
  /** Already formatted, for the accessible table and the peak caption. */
  amount: string
}

/**
 * A monthly trend.
 *
 * The tallest bar is labelled and a gridline is drawn at that value, so every
 * bar can be read against a number that actually appears on the chart. Labelling
 * all of them would be unreadable at 390px, which is the width that matters.
 */
export function TrendChart({
  points,
  peakLabel,
  className,
}: {
  points: TrendPoint[]
  peakLabel: string
  className?: string
}) {
  if (points.length === 0) return null

  const max = Math.max(...points.map((point) => point.value), 1)
  const height = 120
  const gap = 6
  const width = 300
  const barWidth = Math.max((width - gap * (points.length - 1)) / points.length, 4)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="text-muted flex items-baseline justify-between text-xs">
        <span className="font-semibold tracking-wide uppercase">Peak</span>
        <span className="tnum" dir="auto">
          {peakLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Spending per month. Highest: ${peakLabel}.`}
      >
        {/* The line the tallest bar reaches, so the heights mean something. */}
        <line
          x1="0"
          y1="1"
          x2={width}
          y2="1"
          className="stroke-line"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {points.map((point, index) => {
          const barHeight = Math.max((point.value / max) * height, point.value > 0 ? 2 : 0)
          const x = index * (barWidth + gap)
          const isPeak = point.value === max
          return (
            <rect
              key={point.key}
              x={x}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx="2"
              className={isPeak ? 'fill-accent' : 'fill-accent-soft'}
            />
          )
        })}
      </svg>

      <div className="flex" style={{ gap: `${gap}px` }}>
        {points.map((point) => (
          <span key={point.key} className="text-muted text-2xs min-w-0 flex-1 truncate text-center">
            {point.label}
          </span>
        ))}
      </div>

      <ChartTable
        caption="Spending per month"
        columns={['Month', 'Total']}
        rows={points.map((point) => [point.label, point.amount])}
      />
    </div>
  )
}

export type PairedRow = {
  key: string
  label: string
  /** Geometry only. */
  a: number
  b: number
  /** Already formatted. */
  aLabel: string
  bLabel: string
}

/**
 * Two bars per row, on a shared scale.
 *
 * "Paid out" and "used up" are different quantities about the same person, and
 * the gap between them is the whole story. A shared maximum is what makes that
 * gap comparable between people.
 */
export function PairedBars({
  rows,
  aName,
  bName,
  className,
}: {
  rows: PairedRow[]
  aName: string
  bName: string
  className?: string
}) {
  const max = Math.max(...rows.flatMap((row) => [row.a, row.b]), 1)

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="text-muted flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-accent size-2.5 rounded-sm" />
          {aName}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-accent-soft size-2.5 rounded-sm" />
          {bName}
        </span>
      </div>

      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{row.label}</span>
            <span className="text-muted tnum text-xs">
              <span className="amount">{row.aLabel}</span> /{' '}
              <span className="amount">{row.bLabel}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Bar share={row.a / max} tone="strong" label={`${aName}: ${row.aLabel}`} />
            <Bar share={row.b / max} tone="soft" label={`${bName}: ${row.bLabel}`} />
          </div>
        </div>
      ))}

      <ChartTable
        caption="Paid and consumed per person"
        columns={['Person', aName, bName]}
        rows={rows.map((row) => [row.label, row.aLabel, row.bLabel])}
      />
    </div>
  )
}

function Bar({ share, tone, label }: { share: number; tone: 'strong' | 'soft'; label: string }) {
  return (
    <span
      className="bg-sunken block h-1.5 w-full overflow-hidden rounded-sm"
      role="img"
      aria-label={label}
    >
      <span
        className={cn(
          'block h-full rounded-sm',
          tone === 'strong' ? 'bg-accent' : 'bg-accent-soft',
        )}
        style={{ inlineSize: `${Math.max(share * 100, 1)}%` }}
      />
    </span>
  )
}

/**
 * The chart, as a table, for screen readers.
 *
 * A bar is not a number to anyone who cannot see it, and `aria-label` on the SVG
 * only carries the headline. This carries every value.
 */
function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: string[]
  rows: string[][]
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, index) =>
              index === 0 ? (
                <th key={cell} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={`${row[0]}-${index}`}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
