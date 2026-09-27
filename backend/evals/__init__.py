"""Measurements of the AI features against the real model.

Not part of the app and not run by CI: each run calls Claude and costs money.
The tests in `tests/` check the machinery -- the grader and the answer key --
without a key; the evaluations themselves are run by hand, from `backend/`:

    python eval_text_to_sql.py
"""
