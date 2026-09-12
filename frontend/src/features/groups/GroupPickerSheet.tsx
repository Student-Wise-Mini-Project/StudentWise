import { useNavigate } from 'react-router'

import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { useAuth } from '@/features/auth/authContext'
import { useOverallPosition } from '@/features/activity/api'
import { useT } from '@/i18n/i18nContext'

import { useGroups } from './api'
import { openGroupsInPickOrder } from './pickOrder'

/**
 * "Add to which group?" — the sheet the `+` bar opens outside a group.
 *
 * The bar used to hand you the groups list here, which drops the intention you
 * arrived with: you tapped *add an expense* and got a screen about groups, and
 * had to form the thought again on the other side. This carries it through.
 *
 * Each row shows the viewer's net in that group rather than only its name,
 * because "which one?" is easier to answer against ₪120 / ₪0 / -₪40 than
 * against a list of nouns. Those balances are already cached by the home
 * screen's position slab under the same query keys, so the sheet costs nothing.
 */
export function GroupPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const groups = useGroups()
  const position = useOverallPosition(groups.data, user?.id)

  const rows = openGroupsInPickOrder(groups.data)
  const netOf = (groupId: string) =>
    position.perGroup.find((entry) => entry.groupId === groupId)?.net

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('common.picker.title')}
      description={t('common.picker.description')}
    >
      <div className="-mx-4 flex flex-col">
        {rows.map((group) => {
          const net = netOf(group.id)
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                onClose()
                void navigate(`/groups/${group.id}/expenses/new`)
              }}
              className="hover:bg-sunken active:bg-sunken flex items-center gap-3 px-4 py-3.5 text-start transition-colors"
            >
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{group.name}</span>
              {net !== undefined && (
                <Money amount={net} currency={group.currency} tone="auto" size="sm" />
              )}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
