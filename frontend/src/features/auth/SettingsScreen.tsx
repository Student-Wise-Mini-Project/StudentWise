import { useEffect, useState } from 'react'

import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow, ListSection } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Page, Stack } from '@/components/layout'
import { applyTheme, readStoredTheme, type Theme } from '@/lib/prefs'

import { useAuth } from './authContext'

export function SettingsScreen() {
  const { user, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <>
      <AppBar title="You" />

      <Page width="narrow">
        <Stack gap={5} className="pt-4">
          {user && (
            <Card className="mx-4">
              <Stack direction="row" gap={3} className="items-center">
                <Avatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="font-display truncate text-lg font-semibold">{user.name}</p>
                  <p className="text-muted truncate text-sm">{user.email}</p>
                </div>
              </Stack>
            </Card>
          )}

          <div className="px-4">
            <p className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              Appearance
            </p>
            <SegmentedControl
              name="theme"
              value={theme}
              onChange={setTheme}
              segments={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <ListSection header="About">
            <ListRow title="StudentWise" subtitle="Splitting expenses without the awkwardness" />
            <ListRow
              title="API"
              subtitle="Every amount you see comes from the server, never recalculated here"
            />
          </ListSection>

          <div className="px-4 pt-2">
            <Button variant="danger" fullWidth onClick={signOut}>
              Sign out
            </Button>
            <p className="text-muted mt-2 text-center text-xs">
              Signing out also clears the data this device kept for offline use.
            </p>
          </div>
        </Stack>
      </Page>
    </>
  )
}
