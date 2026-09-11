import { Route, Routes } from 'react-router'

import { RedirectIfAuthed, RequireAuth } from '@/app/guards/RequireAuth'
import { AppShell } from '@/app/layouts/AppShell'
import { EmptyState } from '@/components/feedback'
import { Page } from '@/components/layout'
import { KitchenSink } from '@/dev/KitchenSink'
import { LoginScreen, RegisterScreen } from '@/features/auth/AuthScreens'
import { SettingsScreen } from '@/features/auth/SettingsScreen'
import { env } from '@/lib/env'

/**
 * Every path in the app, in one file.
 *
 * Two trees: a public one for signing in, and everything else behind
 * `RequireAuth` inside the shell. Screens arrive commit by commit; the
 * placeholders keep the shell navigable in the meantime.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Placeholder title="Home" />} />
          <Route path="groups" element={<Placeholder title="Groups" />} />
          <Route path="groups/:groupId" element={<Placeholder title="Group" />} />
          <Route path="expenses/:expenseId" element={<Placeholder title="Expense" />} />
          <Route path="notifications" element={<Placeholder title="Alerts" />} />
          <Route path="settings" element={<SettingsScreen />} />

          {/* Dev only. `env.DEV` is statically false in a production build, so
              the gallery and everything it imports are tree-shaken out. */}
          {env.DEV && <Route path="__kitchen-sink" element={<KitchenSink />} />}

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <Page width="narrow">
      <EmptyState
        title={title}
        body="This screen is not built yet. The shell, the navigation and sign-in are."
        action={env.DEV ? { label: 'See the components', to: '/__kitchen-sink' } : undefined}
      />
    </Page>
  )
}

function NotFound() {
  return (
    <Page width="narrow">
      <EmptyState
        title="Nothing here"
        body="That page does not exist."
        action={{ label: 'Go home', to: '/' }}
      />
    </Page>
  )
}
