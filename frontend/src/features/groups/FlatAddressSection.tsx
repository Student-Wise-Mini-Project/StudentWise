import { useState } from 'react'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { ListSection } from '@/components/ListRow'
import { useT } from '@/i18n/i18nContext'

import { useUpdateGroup } from './api'
import { useGroupScope } from './groupContext'

/**
 * The flat's street address. It is what tells which flat a bill from email
 * belongs to, for someone who lives in more than one, so the hint asks for it
 * the way the bills print it.
 *
 * Only apartments have one -- a trip or a couple never gets a utility bill --
 * and only an owner can change it.
 */
export function FlatAddressSection() {
  const t = useT()
  const { group, groupId, isOwner } = useGroupScope()
  const update = useUpdateGroup(groupId)
  const [address, setAddress] = useState(group.address ?? '')

  if (group.type !== 'SHARED_APARTMENT') return null

  const changed = address.trim() !== (group.address ?? '')

  return (
    <ListSection header={t('bills.address.header')}>
      <div className="flex flex-col gap-2 px-4 py-3">
        {isOwner ? (
          <>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={300}
              dir="auto"
              aria-label={t('bills.address.aria')}
              placeholder={t('bills.address.placeholder')}
              className="border-line-strong bg-surface text-control placeholder:text-faint h-11 rounded-md border px-3"
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={!changed}
                loading={update.isPending}
                onClick={() => update.mutate({ address: address.trim() })}
              >
                {t('bills.address.save')}
              </Button>
              {update.isSuccess && !changed && (
                <span role="status" className="text-credit text-sm">
                  {t('bills.address.saved')}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-base" dir="auto">
            {group.address ?? t('bills.address.none')}
          </p>
        )}
        <p className="text-muted text-xs">{t('bills.address.hint')}</p>
        {update.isError && (
          <p role="alert" className="text-danger text-sm">
            {detailOf(update.error)}
          </p>
        )}
      </div>
    </ListSection>
  )
}
