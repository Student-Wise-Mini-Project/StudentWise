"""Post every recurring bill that has fallen due, everywhere.

The cron entry point for Epic 6. Run it from `backend/` with the venv active:

    python run_due_bills.py

Once a day is plenty. Once an hour costs a couple of queries and changes
nothing, because the work is idempotent: a bill already posted for its due date
has moved on, and a reminder already sent is not sent again.

Wire it up with whatever the deployment has -- Windows Task Scheduler, cron, a
GitHub Actions schedule, a platform cron job:

    0 6 * * *  cd /srv/studentwise/backend && .venv/bin/python run_due_bills.py

If nothing runs it, nothing breaks. The app calls
`POST /groups/{id}/recurring-bills/run` on load, so bills catch up the next time
somebody opens it -- which is the whole reason the work is written to be
catch-up-able rather than to assume it runs exactly once per period.
"""

import sys
from datetime import date

from app.db import SessionLocal
from app.models.group import Group
from app.repositories.recurring_bill_repository import RecurringBillRepository
from app.services import recurring_bill_service


def main() -> int:
    today = date.today()
    horizon = date.fromordinal(today.toordinal() + recurring_bill_service.REMINDER_HORIZON_DAYS)

    db = SessionLocal()
    try:
        bills = RecurringBillRepository(db).due_everywhere(on_or_before=horizon)
        group_ids = sorted({bill.group_id for bill in bills}, key=str)

        if not group_ids:
            print(f"{today}: nothing due.")
            return 0

        posted = reminded = waiting = 0
        for group_id in group_ids:
            group = db.get(Group, group_id)
            if group is None:  # pragma: no cover -- groups cascade their bills
                continue

            # One transaction per group, so one group's bad data cannot stop
            # every other group's rent from being posted.
            try:
                result = recurring_bill_service.run(db, group, today=today)
            except Exception as error:  # noqa: BLE001 -- a cron job keeps going
                db.rollback()
                print(f"  {group.name}: FAILED -- {error}", file=sys.stderr)
                continue

            posted += len(result.generated)
            reminded += len(result.reminded)
            waiting += len(result.awaiting_amount)
            if result.generated or result.reminded:
                print(
                    f"  {group.name}: {len(result.generated)} posted, "
                    f"{len(result.reminded)} reminded"
                )

        print(f"{today}: {posted} expenses posted, {reminded} reminders sent.")
        if waiting:
            print(f"{waiting} bill(s) are due but need someone to enter an amount.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
