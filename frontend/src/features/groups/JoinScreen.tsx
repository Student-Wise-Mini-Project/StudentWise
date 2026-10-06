import { useNavigate, useParams } from 'react-router'

import { ApiError, detailOf } from '@/api/errors'
import { AppBar } from '@/app/layouts/AppBar'
import { Button, LinkButton } from '@/components/Button'
import { Spinner } from '@/components/Spinner'
import { Page, Stack } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'
import { groupTypeLabel } from '@/lib/labels'

import { useAcceptInvite, useInvitePreview } from './api'

/**
 * Where an invite link lands: `/join/:token`.
 *
 * Behind sign-in, so someone without an account signs up first and comes back
 * here (the `next` the sign-in pages carry). Shows only what the link is for
 * -- the group's name and who invited -- and joins on one tap.
 */
export function JoinScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const preview = useInvitePreview(token)
  const accept = useAcceptInvite(token)

  const invalid = preview.error instanceof ApiError && preview.error.status === 404

  return (
    <>
      <AppBar title={t('groups.join.title')} back="/groups" />
      <Page width="narrow" padded>
        <Stack gap={4} className="py-6">
          {preview.isLoading && <Spinner size="lg" label={t('common.actions.loading')} />}

          {preview.isError && (
            <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
              {invalid ? t('groups.join.invalid') : detailOf(preview.error)}
            </p>
          )}

          {preview.data && (
            <>
              <div className="bg-surface border-line flex flex-col gap-1 rounded-md border p-5">
                <span className="text-muted text-sm">
                  {t('groups.join.invitedBy', { name: preview.data.invited_by })}
                </span>
                <h2 className="font-display text-2xl font-extrabold" dir="auto">
                  {preview.data.group_name}
                </h2>
                <span className="text-muted text-sm">
                  {groupTypeLabel(t, preview.data.group_type)}
                </span>
              </div>

              {accept.isError && (
                <p
                  role="alert"
                  className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm"
                >
                  {detailOf(accept.error)}
                </p>
              )}

              {preview.data.already_member ? (
                <>
                  <p className="text-sm">{t('groups.join.already')}</p>
                  <LinkButton to={`/groups/${preview.data.group_id}`} fullWidth>
                    {t('groups.join.open')}
                  </LinkButton>
                </>
              ) : preview.data.is_open ? (
                <Button
                  size="lg"
                  fullWidth
                  loading={accept.isPending}
                  onClick={() =>
                    accept.mutate(undefined, {
                      onSuccess: ({ group_id }) =>
                        navigate(`/groups/${group_id}`, { replace: true }),
                    })
                  }
                >
                  {t('groups.join.join', { group: preview.data.group_name })}
                </Button>
              ) : (
                <p className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm">
                  {t('groups.join.closed')}
                </p>
              )}
            </>
          )}
        </Stack>
      </Page>
    </>
  )
}
