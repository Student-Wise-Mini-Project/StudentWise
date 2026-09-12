import type { ReactNode } from 'react'
import { useState } from 'react'

import { EXPENSE_CATEGORIES, SPLIT_TYPES } from '@/api/types'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { Badge, CountBadge } from '@/components/Badge'
import { Button, LinkButton } from '@/components/Button'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { Input, Select, Textarea } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DonutChart, PairedBars, TrendChart } from '@/components/charts'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { EmptyState, ErrorState, ListRowSkeleton, Skeleton } from '@/components/feedback'
import { ChevronEnd, ReceiptIcon, ScalesIcon } from '@/components/icons'
import { Page, PageHeader, Stack } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'
import { categoryLabel, splitTypeLabel } from '@/lib/labels'
import { divideForDisplay } from '@/lib/money'

const PEOPLE = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Gal Harel' },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'Maya Cohen' },
  { id: 'a1b2c3d4-0000-4000-8000-000000000003', name: 'Noa Levi' },
  { id: 'a1b2c3d4-0000-4000-8000-000000000004', name: 'Dana Bernstein' },
  { id: 'a1b2c3d4-0000-4000-8000-000000000005', name: 'Hila Zuk' },
]

const [GAL, MAYA, NOA] = PEOPLE as [
  (typeof PEOPLE)[number],
  (typeof PEOPLE)[number],
  (typeof PEOPLE)[number],
]

/**
 * Every primitive, in every variant, on one page.
 *
 * This is the review surface for a redesign: when the Claude Design output lands,
 * the reviewer checks this one page rather than sixteen screens. It is also where
 * a component gets built and looked at before any feature depends on it.
 *
 * Dev only. The route is not registered in a production build.
 */
export function KitchenSink() {
  const t = useT()
  const [split, setSplit] = useState<(typeof SPLIT_TYPES)[number]>('EQUAL')
  const [amount, setAmount] = useState('212.30')
  const [sheetOpen, setSheetOpen] = useState(false)

  const equalShare = divideForDisplay('212.30', 3)

  return (
    <Page width="narrow">
      <PageHeader title="Kitchen sink" subtitle="Every shared component, in one place." />

      <Stack gap={6} className="px-4 pb-10">
        <Section title="The slab">
          {/* Exactly one of these per screen, carrying the number the user
           * opened the app for. It stays dark in both themes. */}
          <div className="bg-slab text-on-slab rounded-sm px-5 py-5">
            <div className="font-display text-2xs text-faint font-extrabold tracking-widest uppercase">
              Overall you're owed
            </div>
            <div className="mt-1.5">
              <Money amount="412.60" size="hero" className="text-slab-credit" sign="always" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border-line-strong rounded-sm border px-3 py-2">
                <div className="text-2xs text-faint">Dizengoff 5</div>
                <Money amount="141.53" size="sm" className="text-slab-credit" sign="always" />
              </div>
              <div className="border-line-strong rounded-sm border px-3 py-2">
                <div className="text-2xs text-faint">Eilat trip</div>
                <Money amount="-113.33" size="sm" className="text-slab-debt" sign="always" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Money">
          <Card>
            <Stack gap={2}>
              <Row label="Neutral">
                <Money amount="412.60" />
              </Row>
              <Row label="Credit, signed">
                <Money amount="412.60" tone="credit" sign="always" size="lg" />
              </Row>
              <Row label="Debt, signed">
                <Money amount="-280.10" tone="debt" sign="always" size="lg" />
              </Row>
              <Row label="Auto tone by sign">
                <Money amount="-132.50" tone="auto" sign="always" />
              </Row>
              <Row label="Display size">
                <Money amount="6000.00" size="display" />
              </Row>
              <Row label="Approximate (the sign is forced)">
                {equalShare && <Money amount={equalShare} tone="muted" />}
              </Row>
            </Stack>
          </Card>
        </Section>

        <Section title="Buttons">
          <Stack gap={2}>
            <Stack direction="row" gap={2} className="flex-wrap">
              <Button>Settle up</Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="danger">Delete</Button>
            </Stack>
            <Stack direction="row" gap={2} className="flex-wrap items-center">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
            </Stack>
            <LinkButton to="/" variant="secondary" fullWidth>
              A link that looks like a button
            </LinkButton>
          </Stack>
        </Section>

        <Section title="Forms">
          <Card>
            <Stack gap={4}>
              <Field label="Title" required hint="What was it for?">
                {(props) => <Input {...props} defaultValue="Supermarket" />}
              </Field>

              <Field label="Amount" required>
                {(props) => <MoneyInput {...props} value={amount} onValueChange={setAmount} />}
              </Field>

              <Field label="Amount, hero treatment">
                {(props) => (
                  <MoneyInput {...props} size="hero" value={amount} onValueChange={setAmount} />
                )}
              </Field>

              <Field label="Category">
                {(props) => (
                  <Select {...props} defaultValue="GROCERIES">
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(t, category)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="How is it split?">
                {() => (
                  <SegmentedControl
                    name="split type"
                    value={split}
                    onChange={setSplit}
                    segments={SPLIT_TYPES.map((type) => ({
                      value: type,
                      label: splitTypeLabel(t, type),
                    }))}
                  />
                )}
              </Field>

              <Field label="Notes">
                {(props) => <Textarea {...props} placeholder="Optional" />}
              </Field>

              <Field label="Amount" error="Splits add up to 99.99, not 100.00.">
                {(props) => <Input {...props} defaultValue="100.00" />}
              </Field>
            </Stack>
          </Card>
        </Section>

        <Section title="People">
          <Card>
            <Stack gap={3}>
              <Stack direction="row" gap={2} className="items-center">
                <Avatar user={GAL} size="xs" />
                <Avatar user={MAYA} size="sm" />
                <Avatar user={NOA} size="md" />
                <Avatar user={GAL} size="lg" />
              </Stack>
              <AvatarStack users={PEOPLE} max={3} />
            </Stack>
          </Card>
        </Section>

        <Section title="Badges">
          <Stack direction="row" gap={2} className="flex-wrap items-center">
            <Badge tone="neutral">Uncategorised</Badge>
            <Badge tone="accent">Owner</Badge>
            <Badge tone="credit">Settled</Badge>
            <Badge tone="debt">Overdue</Badge>
            <Badge tone="warn">80% of budget</Badge>
            <Badge tone="danger">Over budget</Badge>
            <CountBadge count={3} />
            <CountBadge count={142} />
          </Stack>
        </Section>

        <Section title="List rows">
          <ListSection header="Dizengoff 5">
            <ListRow
              leading={<Avatar user={GAL} />}
              title="Rent"
              subtitle="Gal paid it on 1 Sep"
              meta={<Money amount="6000.00" size="lg" />}
              metaSubtitle="split by room size"
              trailing={<ChevronEnd />}
              onClick={() => {}}
            />
            <ListRow
              leading={<Avatar user={MAYA} />}
              title="Supermarket"
              subtitle="Maya paid it on 9 Sep"
              meta={<Money amount="212.30" size="lg" />}
              metaSubtitle="split 3 ways"
              trailing={<ChevronEnd />}
              onClick={() => {}}
            />
            <ListRow
              leading={<Avatar user={NOA} />}
              title="Noa Levi"
              subtitle="Member, 1 share"
              meta={<Money amount="-132.50" tone="auto" sign="always" />}
            />
          </ListSection>
        </Section>

        <Section title="Overlays">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open a sheet
          </Button>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Record a payment"
            description="This is what actually moves the balances."
            footer={
              <>
                <Button variant="secondary" fullWidth onClick={() => setSheetOpen(false)}>
                  Cancel
                </Button>
                <Button fullWidth onClick={() => setSheetOpen(false)}>
                  Record it
                </Button>
              </>
            }
          >
            <Stack gap={4}>
              <p className="text-muted text-sm">
                A bottom sheet on a phone, a centred dialog on a desktop, from one component.
              </p>
              <Field label="Amount">
                {(props) => <MoneyInput {...props} value="280.10" onValueChange={() => {}} />}
              </Field>
            </Stack>
          </Sheet>
        </Section>

        <Section title="Charts">
          <Card>
            <DonutChart
              totalLabel="Total"
              total="₪5,303.20"
              slices={[
                {
                  key: 'u',
                  label: 'Utilities',
                  share: 87.8,
                  amount: '₪4,657.90',
                  caption: '87.8%',
                },
                { key: 'g', label: 'Groceries', share: 7.6, amount: '₪401.80', caption: '7.6%' },
                {
                  key: 'e',
                  label: 'Entertainment',
                  share: 2.7,
                  amount: '₪143.50',
                  caption: '2.7%',
                },
                { key: 'o', label: 'Other', share: 1.9, amount: '₪100.00', caption: '1.9%' },
              ]}
            />
          </Card>
          <Card>
            <TrendChart
              peakLabel="August 2026 · ₪1,397.20"
              points={[
                { key: '3', label: 'Mar', value: 530, amount: '₪530.00' },
                { key: '4', label: 'Apr', value: 556.8, amount: '₪556.80' },
                { key: '5', label: 'May', value: 515.1, amount: '₪515.10' },
                { key: '6', label: 'Jun', value: 581.3, amount: '₪581.30' },
                { key: '7', label: 'Jul', value: 545.5, amount: '₪545.50' },
                { key: '8', label: 'Aug', value: 1397.2, amount: '₪1,397.20' },
                { key: '9', label: 'Sept', value: 1177.3, amount: '₪1,177.30' },
              ]}
            />
          </Card>
          <Card>
            <PairedBars
              aName="Paid out"
              bName="Used up"
              rows={[
                {
                  key: 'm',
                  label: 'Maya',
                  a: 3757.4,
                  b: 1800.62,
                  aLabel: '₪3,757.40',
                  bLabel: '₪1,800.62',
                },
                {
                  key: 'g',
                  label: 'Gal',
                  a: 401.8,
                  b: 1776.56,
                  aLabel: '₪401.80',
                  bLabel: '₪1,776.56',
                },
                {
                  key: 'n',
                  label: 'Noa',
                  a: 1144,
                  b: 1726.02,
                  aLabel: '₪1,144.00',
                  bLabel: '₪1,726.02',
                },
              ]}
            />
          </Card>
        </Section>

        <Section title="Loading, empty and failed">
          <Stack gap={4}>
            <ListRowSkeleton count={2} />
            <Stack direction="row" gap={3} className="items-center">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <Skeleton className="h-4 w-32" />
            </Stack>
            <Card padding="none">
              <EmptyState
                icon={<ReceiptIcon className="size-5" />}
                title="No expenses yet"
                body="Add the first one and everyone else will see it."
                action={{ label: 'Add an expense', onClick: () => {} }}
                size="inline"
              />
            </Card>
            <Card padding="none">
              <ErrorState
                error={{ detail: 'You are not an active member of that group.' }}
                onRetry={() => {}}
                size="inline"
              />
            </Card>
            <Card padding="none">
              <EmptyState
                icon={<ScalesIcon className="size-5" />}
                title="Everyone is square"
                body="Nothing left to settle up."
                size="inline"
              />
            </Card>
          </Stack>
        </Section>
      </Stack>
    </Page>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted text-sm">{label}</span>
      {children}
    </div>
  )
}
