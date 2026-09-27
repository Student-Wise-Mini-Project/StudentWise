"""Measure how often the Ask screen gets the answer right (mission 4.4).

Run from `backend/` with the venv active and Postgres up:

    python eval_text_to_sql.py                      # every question once
    python eval_text_to_sql.py --repeat 3           # how stable is it?
    python eval_text_to_sql.py --only who-paid-most,balances
    python eval_text_to_sql.py --model claude-opus-5 --report ../docs/evals/opus.md

Calls the real model, so it needs ANTHROPIC_API_KEY and costs money -- a few
cents for one pass over the questions. It builds the demo data in the *test*
database (studentwise_test), never the development one. The questions and
their answers are in `evals/text_to_sql_cases.py`.
"""

import argparse
import sys
from pathlib import Path

from app.config import settings
from evals.text_to_sql import Attempt, report, run
from evals.text_to_sql_cases import CASES


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repeat", type=int, default=1, help="ask each question N times")
    parser.add_argument("--only", help="comma-separated case ids")
    parser.add_argument("--held-out", action="store_true", help="only the held-out questions")
    parser.add_argument("--model", help=f"instead of NL_QUERY_MODEL ({settings.nl_query_model})")
    parser.add_argument("--workers", type=int, default=4, help="questions in flight at once")
    parser.add_argument("--report", type=Path, help="also write the report to this file")
    args = parser.parse_args()

    if not settings.anthropic_api_key:
        print("ANTHROPIC_API_KEY is not set in backend/.env -- nothing to measure.")
        return 2
    if args.model:
        settings.nl_query_model = args.model

    cases = CASES
    if args.only:
        wanted = {name.strip() for name in args.only.split(",")}
        unknown = wanted - {case.id for case in CASES}
        if unknown:
            print(f"No such case: {', '.join(sorted(unknown))}")
            return 2
        cases = tuple(case for case in CASES if case.id in wanted)
    if args.held_out:
        cases = tuple(case for case in cases if case.held_out)

    print(f"{len(cases)} questions x {args.repeat} on {settings.nl_query_model}\n")

    def progress(attempt: Attempt) -> None:
        mark = "PASS" if attempt.passed else "FAIL"
        print(f"  {mark}  {attempt.case.id:<28} {attempt.seconds:5.1f}s  {attempt.reason}")

    result = run(cases, repeat=args.repeat, workers=args.workers, on_attempt=progress)
    text = report(result)
    print()
    print(text.split("\n## Every question")[0])

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
        print(f"Report written to {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
