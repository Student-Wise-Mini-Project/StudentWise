/** Provider stack only. Routing lives in `routes.tsx`, screens live in features. */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-muted text-xs font-semibold tracking-[0.14em] uppercase">
        Mission 9.1 — scaffold
      </p>
      <h1 className="font-display text-3xl">StudentWise</h1>
      <p className="text-muted text-base">
        Split expenses with the people you live, travel and eat with.
      </p>
      <div className="border-line bg-surface shadow-raised rounded-xl border p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium">Gal is owed</span>
          <span className="text-credit tnum font-display text-2xl font-semibold">+₪412.60</span>
        </div>
        <div className="border-line mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
          <span className="text-sm font-medium">Maya owes</span>
          <span className="text-debt tnum font-display text-2xl font-semibold">−₪280.10</span>
        </div>
      </div>
      <button
        type="button"
        className="bg-accent text-on-accent hover:bg-accent-hover rounded-lg px-4 py-3 text-base font-semibold transition-colors"
      >
        Settle up
      </button>
    </main>
  )
}
