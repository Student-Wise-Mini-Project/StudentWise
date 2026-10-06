import { useEffect } from 'react'

import { detailOf } from '@/api/errors'
import { Button, ExternalLinkButton } from '@/components/Button'
import { CopyButton } from '@/components/CopyButton'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { Stack } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'
import { formatDay } from '@/lib/dates'
import { inviteUrl, mailtoUrl, whatsappUrl } from '@/lib/invite'

import { useShareInvite } from './api'

/**
 * Share the group's invite link: WhatsApp, the person's own email app, copy,
 * or the phone's share sheet. Whoever opens it joins, signing up first if they
 * have no account -- which is what adding by email cannot do.
 *
 * `emails` are people the group could not add because they have no account
 * yet: they are named, and an email goes straight to them.
 */
export function InviteSheet({
  groupId,
  groupName,
  open,
  onClose,
  emails = [],
}: {
  groupId: string
  groupName: string
  open: boolean
  onClose: () => void
  emails?: string[]
}) {
  const t = useT()
  const share = useShareInvite(groupId)
  const { mutate } = share

  // Fetched when opened, not before: an invite link nobody asked for is a
  // link that need not exist.
  useEffect(() => {
    if (open) mutate({})
  }, [open, mutate])

  const invite = share.data
  const url = invite ? inviteUrl(invite.token) : ''
  const message = t('groups.invite.message', { group: groupName, url })
  const subject = t('groups.invite.subject', { group: groupName })
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('groups.invite.title', { group: groupName })}
      description={t('groups.invite.description', { group: groupName })}
    >
      <Stack gap={4}>
        {emails.length > 0 && (
          <p className="bg-accent-soft text-accent rounded-sm px-3 py-2.5 text-sm">
            {t('groups.invite.forWhom', { emails: emails.join(', ') })}
          </p>
        )}

        {share.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(share.error)}
          </p>
        )}

        {!invite && share.isPending && <Spinner label={t('common.actions.loading')} />}

        {invite && (
          <>
            <Field
              label={t('groups.invite.linkLabel')}
              hint={t('groups.invite.expires', {
                date: formatDay(invite.expires_at.slice(0, 10)),
              })}
            >
              {(props) => (
                <div className="flex items-center gap-2">
                  <Input {...props} value={url} readOnly dir="ltr" className="min-w-0 flex-1" />
                  <CopyButton value={url} label={t('groups.invite.copy')} />
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <ExternalLinkButton href={whatsappUrl(message)} fullWidth>
                {t('groups.invite.whatsapp')}
              </ExternalLinkButton>
              <ExternalLinkButton
                href={mailtoUrl({ to: emails.join(','), subject, body: message })}
                variant="secondary"
                fullWidth
              >
                {t('groups.invite.email')}
              </ExternalLinkButton>
            </div>

            {canShare && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() =>
                  void navigator.share({ title: subject, text: message }).catch(() => {})
                }
              >
                {t('groups.invite.share')}
              </Button>
            )}

            <div className="flex flex-col items-start gap-1">
              <Button
                variant="ghost"
                size="sm"
                loading={share.isPending}
                onClick={() => share.mutate({ renew: true })}
              >
                {t('groups.invite.renew')}
              </Button>
              <span className="text-muted text-xs">{t('groups.invite.renewNote')}</span>
            </div>
          </>
        )}
      </Stack>
    </Sheet>
  )
}
