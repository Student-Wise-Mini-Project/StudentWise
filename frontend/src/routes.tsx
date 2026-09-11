import { Route, Routes } from 'react-router'

import { RedirectIfAuthed, RequireAuth } from '@/app/guards/RequireAuth'
import { AppShell } from '@/app/layouts/AppShell'
import { EmptyState } from '@/components/feedback'
import { Page } from '@/components/layout'
import { KitchenSink } from '@/dev/KitchenSink'
import { LoginScreen, RegisterScreen } from '@/features/auth/AuthScreens'
import { SettingsScreen } from '@/features/auth/SettingsScreen'
import { ExpenseDetailScreen } from '@/features/expenses/ExpenseDetailScreen'
import { EditExpenseScreen, NewExpenseScreen } from '@/features/expenses/ExpenseEditorScreen'
import { ExpenseListScreen } from '@/features/expenses/ExpenseListScreen'
import { ExpenseRedirect } from '@/features/expenses/ExpenseRedirect'
import { GroupScopeRoute, GroupTabsLayout } from '@/features/groups/GroupLayout'
import { GroupListScreen } from '@/features/groups/GroupListScreen'
import { MembersScreen } from '@/features/groups/MembersScreen'
import { env } from '@/lib/env'

/**
 * Every path in the app, in one file.
 *
 * The nesting carries two decisions worth reading:
 *
 * - `GroupScopeRoute` fetches the group and provides it; `GroupTabsLayout` adds
 *   the tab chrome. The expense editor and detail screens sit under the first
 *   and not the second, because they need the group's members and currency but
 *   must not appear underneath a row of tabs.
 * - `/expenses/:id` is a redirect into the group-scoped route. The API's expense
 *   route is flat and the activity feed links to expenses without knowing their
 *   group, so the deep link resolves itself rather than forcing a group id into
 *   every link that points at an expense.
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
          <Route path="groups" element={<GroupListScreen />} />

          <Route path="groups/:groupId" element={<GroupScopeRoute />}>
            <Route element={<GroupTabsLayout />}>
              <Route index element={<ExpenseListScreen />} />
              <Route path="balances" element={<Placeholder title="Balances" />} />
              <Route path="members" element={<MembersScreen />} />
            </Route>

            <Route path="expenses/new" element={<NewExpenseScreen />} />
            <Route path="expenses/:expenseId" element={<ExpenseDetailScreen />} />
            <Route path="expenses/:expenseId/edit" element={<EditExpenseScreen />} />
          </Route>

          <Route path="expenses/:expenseId" element={<ExpenseRedirect />} />
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
        body="This screen is not built yet."
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
