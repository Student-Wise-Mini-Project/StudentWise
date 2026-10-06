"""`seed.py` wipes everything first. On a laptop that is the point; anywhere
else it must be asked for by name."""

import pytest

from seed import may_wipe

NEON = "postgresql+psycopg://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb?sslmode=require"


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://studentwise:studentwise@localhost:5434/studentwise",
        "postgresql+psycopg://studentwise:studentwise@127.0.0.1:5432/studentwise",
    ],
)
def test_a_local_database_may_always_be_wiped(url):
    assert may_wipe(url, [])


def test_a_hosted_database_is_not_wiped_by_default():
    assert not may_wipe(NEON, [])


def test_naming_the_host_allows_it():
    assert may_wipe(NEON, ["--wipe=ep-cool-1.eu-central-1.aws.neon.tech"])


def test_naming_a_different_host_does_not():
    """Confirming for staging must not wipe production."""
    assert not may_wipe(NEON, ["--wipe=ep-other-2.eu-central-1.aws.neon.tech"])
