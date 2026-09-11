import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/index.css'

// An on-screen devtools panel, for debugging on a phone where no inspector can
// reach. Off unless the URL says `?debug`. The condition is a compile-time
// constant, so this whole branch -- and eruda with it -- is dropped from the
// production build.
if (import.meta.env.DEV) {
  void import('./dev/mobileConsole').then((m) => m.startMobileConsole())
}

const root = document.getElementById('root')
if (!root) throw new Error('No #root element — index.html is wrong.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
