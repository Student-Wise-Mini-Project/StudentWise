import { useEffect, useState } from 'react'

import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow, ListSection } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Page, Stack } from '@/components/layout'
import { useLocale, useT } from '@/i18n/i18nContext'
import { applyTheme, readStoredTheme, type Theme } from '@/lib/prefs'

import { useAuth } from './authContext'

export function SettingsScreen() {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { user, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <>
      <AppBar title={t('settings.title')} />

      <Page width="narrow">
        <Stack gap={5} className="pt-4">
          {user && (
            <Card className="mx-4">
              <Stack direction="row" gap={3} className="items-center">
                <Avatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="font-display truncate text-lg font-extrabold">{user.name}</p>
                  <p className="text-muted truncate text-sm">{user.email}</p>
                </div>
              </Stack>
            </Card>
          )}

          <div className="px-4">
            <p className="text-muted font-display text-2xs mb-2 font-extrabold tracking-widest uppercase">
              {t('settings.appearance')}
            </p>
            <SegmentedControl
              name="theme"
              value={theme}
              onChange={setTheme}
              segments={[
                { value: 'system', label: t('settings.theme.system') },
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
              ]}
            />
          </div>

          {/* Mirrors the Appearance block exactly, because it is the same kind
           * of thing: a property of this phone, stored beside the theme, and
           * kept when you sign out. */}
          <div className="px-4">
            <p className="text-muted font-display text-2xs mb-2 font-extrabold tracking-widest uppercase">
              {t('settings.language')}
            </p>
            <SegmentedControl
              name={t('settings.language')}
              value={locale}
              onChange={setLocale}
              segments={[
                { value: 'he', label: t('settings.locales.he') },
                { value: 'en', label: t('settings.locales.en') },
              ]}
            />
          </div>

          <ListSection header={t('settings.about')}>
            <ListRow title={t('common.appName')} subtitle={t('settings.aboutApp')} />
            <ListRow title={t('settings.aboutApiTitle')} subtitle={t('settings.aboutApi')} />
          </ListSection>

          <div className="px-4 pt-2">
            <Button variant="danger" fullWidth onClick={signOut}>
              {t('settings.signOut')}
            </Button>
            <p className="text-muted mt-2 text-center text-xs">{t('settings.signOutNote')}</p>
          </div>
        </Stack>
      </Page>
    </>
  )
}
