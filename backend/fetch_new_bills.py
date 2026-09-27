"""Fetch new bills from every connected Gmail. For a real cron job.

    python fetch_new_bills.py        # from backend/, with the venv active

Nothing in the app runs on a scheduler. The app syncs a user's Gmail when they
open it; this is the same work for everyone at once, for a server that wants
bills imported while nobody is looking. Safe to run as often as you like: an
email is only ever read once.
"""

from app.db import SessionLocal
from app.services import gmail_service


def main() -> int:
    with SessionLocal() as db:
        results = gmail_service.sync_everyone(db)

    failures = 0
    for user_id, result in results.items():
        if isinstance(result, str):
            failures += 1
            print(f"{user_id}  FAILED  {result}")
        elif result.needs_reconnect:
            print(f"{user_id}  needs to reconnect Gmail")
        else:
            print(
                f"{user_id}  checked {result.checked}: {result.imported} imported, "
                f"{result.needs_review} to review, {result.skipped} skipped"
            )
    print(f"{len(results)} mailbox(es), {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
