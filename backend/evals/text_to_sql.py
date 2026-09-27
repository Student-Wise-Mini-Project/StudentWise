"""Mission 4.4: how often does the Ask screen give the right answer?

Each question goes through `nl_query_service.ask` -- the same path as the
endpoint: the real model, the guard, the group scope, a read-only transaction.
Its result is compared with the answer key's (see `grading.py`).

The data is `seed.py`'s demo world, built fresh in the **test** database, so a
run never touches anybody's development data and every run sees the same
numbers. The test suite drops that schema when it next starts; nothing here
needs cleaning up.
"""

import contextlib
import io
import time
from collections import Counter
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

import anthropic
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

import seed
from app.config import settings
from app.core.errors import BadRequestError
from app.domain.sql_guard import validate_select, wrap_in_group_scope
from app.models.group import Group
from app.repositories.nl_query_repository import run_scoped_query
from app.services import nl_query_service
from evals.grading import Verdict, compare, leaked
from evals.text_to_sql_cases import Case

BACKEND_ROOT = Path(__file__).resolve().parent.parent

Outcome = Literal["pass", "wrong", "rejected", "error"]

_HEBREW = range(0x0590, 0x0600)


@dataclass(frozen=True)
class Attempt:
    case: Case
    outcome: Outcome
    reason: str
    sql: str | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    #: Headings and explanation came back in the language the app asked for.
    right_language: bool | None = None
    explanation: str = ""
    seconds: float = 0.0

    @property
    def passed(self) -> bool:
        if self.case.check == "safe":
            # Refusing is a fine answer to a hostile question; leaking is not.
            return self.outcome in ("pass", "rejected")
        return self.outcome == "pass"


def gold_answer(connection: Connection, group_id, case: Case):
    """The answer key's result, through the same guard and scope as the model's."""
    scoped = wrap_in_group_scope(validate_select(case.gold_sql), row_limit=1000)
    return run_scoped_query(connection, scoped, group_id)


def _in_language(words: Iterable[str], language: str) -> bool:
    has_hebrew = any(ord(ch) in _HEBREW for word in words for ch in word)
    return has_hebrew if language == "he" else not has_hebrew


def attempt(connection: Connection, group: Group, case: Case) -> Attempt:
    """Ask one question and grade the answer. Never raises for a bad answer."""
    expected = gold_answer(connection, group.id, case) if case.gold_sql else None

    started = time.perf_counter()
    # A failing query aborts the transaction it ran in; a savepoint keeps the
    # connection usable for the next case.
    savepoint = connection.begin_nested()
    try:
        result = nl_query_service.ask(
            connection, group, question=case.question, language=case.language
        )
    except BadRequestError as error:
        return Attempt(case, "rejected", error.detail, seconds=time.perf_counter() - started)
    except DBAPIError as error:
        first_line = str(error.orig).splitlines()[0] if error.orig else str(error)
        return Attempt(case, "error", f"the query failed: {first_line}")
    except anthropic.APIError as error:
        return Attempt(case, "error", f"the model call failed: {error}")
    finally:
        savepoint.rollback()
    seconds = time.perf_counter() - started

    language_ok = _in_language([result.explanation, *result.column_labels.values()], case.language)
    leak = leaked(result.rows, case.forbid)
    if leak:
        verdict = Verdict(False, f"leaked {leak!r}")
    elif case.check == "safe":
        verdict = Verdict(True, "answered without leaking anything")
    else:
        expected_columns, expected_rows = expected
        verdict = compare(
            expected_columns,
            expected_rows,
            result.columns,
            result.rows,
            check=case.check,
            tolerance=case.tolerance,
        )
    return Attempt(
        case,
        "pass" if verdict.passed else "wrong",
        verdict.reason,
        sql=result.sql,
        rows=result.rows,
        right_language=language_ok,
        explanation=result.explanation,
        seconds=seconds,
    )


# --- running it against the real model --------------------------------------------


def prepare_database() -> Engine:
    """Migrate the test database and build the demo world in it."""
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.test_database_url.replace("%", "%%"))
    command.upgrade(config, "head")

    engine = create_engine(settings.test_database_url, pool_size=8)
    with Session(engine, expire_on_commit=False) as db, contextlib.redirect_stdout(io.StringIO()):
        seed.main(db)
    return engine


def _fingerprint(engine: Engine) -> tuple:
    """Enough to notice if anything was written: row counts and the money."""
    with engine.connect() as connection:
        return tuple(
            connection.execute(
                text(
                    "SELECT (SELECT COUNT(*) FROM expenses),"
                    " (SELECT SUM(total_amount) FROM expenses),"
                    " (SELECT COUNT(*) FROM expense_splits),"
                    " (SELECT COUNT(*) FROM users),"
                    " (SELECT COUNT(*) FROM settlements)"
                )
            ).one()
        )


def _run_one(engine: Engine, groups: dict[str, Group], case: Case) -> Attempt:
    # Exactly how the endpoint runs it: a fresh READ ONLY transaction with a
    # statement timeout, always rolled back.
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            connection.exec_driver_sql(
                f"SET LOCAL statement_timeout = {int(settings.nl_query_timeout_ms)}"
            )
            return attempt(connection, groups[case.group], case)
        finally:
            transaction.rollback()


@dataclass(frozen=True)
class Run:
    model: str
    repeat: int
    attempts: list[Attempt]
    untouched: bool


def run(
    cases: Iterable[Case],
    *,
    repeat: int = 1,
    workers: int = 4,
    on_attempt: Callable[[Attempt], None] = lambda _: None,
) -> Run:
    cases = list(cases)
    engine = prepare_database()
    with Session(engine, expire_on_commit=False) as db:
        groups = {g.name: g for g in db.scalars(select(Group))}

    before = _fingerprint(engine)
    jobs = [case for case in cases for _ in range(repeat)]
    attempts: list[Attempt] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for result in pool.map(lambda case: _run_one(engine, groups, case), jobs):
            attempts.append(result)
            on_attempt(result)
    untouched = _fingerprint(engine) == before
    engine.dispose()
    return Run(settings.nl_query_model, repeat, attempts, untouched)


# --- the report ----------------------------------------------------------------------


def _rate(attempts: list[Attempt]) -> str:
    if not attempts:
        return "--"
    passed = sum(a.passed for a in attempts)
    return f"{passed}/{len(attempts)} ({100 * passed / len(attempts):.0f}%)"


def _cell(text_: str) -> str:
    return text_.replace("|", "\\|").replace("\n", " ")


def report(result: Run) -> str:
    attempts = result.attempts
    answerable = [a for a in attempts if a.case.check != "safe"]
    safety = [a for a in attempts if a.case.check == "safe"]
    by_case: dict[str, list[Attempt]] = {}
    for a in attempts:
        by_case.setdefault(a.case.id, []).append(a)
    outcomes = Counter(a.outcome for a in answerable)
    language_checked = [a for a in attempts if a.right_language is not None]
    timed = sorted(a.seconds for a in attempts if a.seconds)

    lines = [
        f"# Text-to-SQL evaluation -- {date.today().isoformat()}",
        "",
        f"Model `{result.model}`, {len(by_case)} questions"
        + (f", each asked {result.repeat} times" if result.repeat > 1 else "")
        + ", against `seed.py`'s demo data. Produced by `python eval_text_to_sql.py`;"
        " how it grades is in `backend/evals/grading.py`.",
        "",
        "| | Result |",
        "|---|---|",
        f"| **Right answer** (execution accuracy) | **{_rate(answerable)}** |",
    ]
    for level in ("easy", "medium", "hard"):
        subset = [a for a in answerable if a.case.level == level]
        lines.append(f"| {level} | {_rate(subset)} |")
    for language, label in (("en", "English app"), ("he", "Hebrew app")):
        subset = [a for a in answerable if a.case.language == language]
        lines.append(f"| {label} | {_rate(subset)} |")
    held_out = [a for a in answerable if a.case.held_out]
    if held_out:
        lines += [
            f"| Original questions | {_rate([a for a in answerable if not a.case.held_out])} |",
            f"| Held-out questions | {_rate(held_out)} |",
        ]
    lines += [
        f"| Safety questions handled safely | {_rate(safety)} |",
        "| Headings and explanation in the app's language | "
        + (
            f"{sum(a.right_language for a in language_checked)}/{len(language_checked)} |"
            if language_checked
            else "-- |"
        ),
        f"| Wrong answer / refused by the guard / query failed | {outcomes['wrong']} / "
        f"{outcomes['rejected']} / {outcomes['error']} |",
        "| Median time per question | " + (f"{timed[len(timed) // 2]:.1f}s |" if timed else "-- |"),
        "| Data unchanged after the run | " + ("yes |" if result.untouched else "**NO** |"),
        "",
    ]
    wrong_language = [a for a in language_checked if not a.right_language]
    if wrong_language:
        lines += ["Not in the app's language:", ""]
        lines += [
            f"- `{a.case.id}` ({a.case.language}): {_cell(a.explanation)}" for a in wrong_language
        ]
        lines.append("")
    lines += [
        "## Every question",
        "",
        "| Question | Group | Level | Result | Why |",
        "|---|---|---|---|---|",
    ]
    for case_attempts in by_case.values():
        case = case_attempts[0].case
        passed = sum(a.passed for a in case_attempts)
        mark = "✅" if passed == len(case_attempts) else ("❌" if passed == 0 else "⚠️")
        score = f"{mark} {passed}/{len(case_attempts)}" if result.repeat > 1 else mark
        why = next((a.reason for a in case_attempts if not a.passed), case_attempts[0].reason)
        lines.append(
            f"| {_cell(case.question)} | {case.group} | {case.level} | {score} | {_cell(why)} |"
        )

    failures = [a for a in attempts if not a.passed]
    if failures:
        lines += ["", "## What went wrong", ""]
        seen: set[tuple[str, str | None]] = set()
        for a in failures:
            if (a.case.id, a.sql) in seen:
                continue
            seen.add((a.case.id, a.sql))
            lines += [
                f"### {a.case.id}: {a.case.question}",
                "",
                f"{a.outcome}: {a.reason}",
                "",
            ]
            if a.sql:
                lines += ["```sql", a.sql, "```", ""]
            if a.rows:
                lines += ["Returned: `" + _cell(str(a.rows[:3]))[:300] + "`", ""]
    return "\n".join(lines) + "\n"
