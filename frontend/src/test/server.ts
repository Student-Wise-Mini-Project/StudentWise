import { setupServer } from 'msw/node'

/**
 * A fake backend for tests.
 *
 * Started with no handlers: each test declares the responses it cares about with
 * `server.use(...)`. A shared default set drifts from the real API and then
 * quietly props up tests that would fail against the real thing.
 */
export const server = setupServer()
