"""Split-rule tests.

A rule is agreed once and then decides money quietly, every month, without
anyone looking. So the tests that matter are about *when it does not apply*:
whoever names participants wins, and a rule must never start refusing to record
rent because somebody moved out.
"""

from decimal import Decimal

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    """Alice (owner), Bob and Carol, in rooms of 14, 12 and 10 square metres."""
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, carol_headers = make_user(email="carol@example.com", name="Carol")

    group = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    ).json()
    for email in ("bob@example.com", "carol@example.com"):
        client.post(f"/api/groups/{group['id']}/members", json={"email": email}, headers=headers)

    return {
        "group_id": group["id"],
        "headers": headers,
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
        "bob_headers": bob_headers,
        "carol_headers": carol_headers,
    }


def make_rule(
    client, flat, *, name="Rent by room size", category="RENT", shares=None, headers=None
):
    if shares is None:
        shares = [
            {"user_id": flat["alice"]["id"], "weight": "14"},
            {"user_id": flat["bob"]["id"], "weight": "12"},
            {"user_id": flat["carol"]["id"], "weight": "10"},
        ]
    payload = {"name": name, "shares": shares}
    if category is not None:
        payload["category"] = category
    return client.post(
        f"/api/groups/{flat['group_id']}/split-rules",
        json=payload,
        headers=headers or flat["headers"],
    )


def post_expense(client, flat, **overrides):
    payload = {
        "title": "September rent",
        "total_amount": "3600.00",
        "expense_date": "2026-09-01",
        "payer_id": flat["alice"]["id"],
        "category": "RENT",
    }
    payload.update(overrides)
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=flat["headers"]
    )


def owed(body) -> dict[str, Decimal]:
    return {s["user"]["email"]: Decimal(s["owed_amount"]) for s in body["splits"]}


# --- writing rules -------------------------------------------------------


def test_a_rule_is_created_and_shows_what_it_works_out_to(client, flat):
    response = make_rule(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["name"] == "Rent by room size"
    assert body["category"] == "RENT"
    assert len(body["shares"]) == 3
    # 14 / 36 = 38.9%. People write square metres; they want to read percentages.
    assert body["share_percent"][flat["alice"]["id"]] == "38.9"
    assert body["share_percent"][flat["carol"]["id"]] == "27.8"


def test_every_member_can_read_the_rules(client, flat):
    make_rule(client, flat)
    response = client.get(
        f"/api/groups/{flat['group_id']}/split-rules", headers=flat["carol_headers"]
    )
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1


def test_only_an_owner_can_write_one(client, flat):
    assert make_rule(client, flat, headers=flat["bob_headers"]).status_code == 403


def test_a_second_rule_for_the_same_category_is_refused(client, flat):
    make_rule(client, flat)
    response = make_rule(client, flat, name="Rent, but different")
    assert response.status_code == 409
    assert "already has a rule" in response.json()["detail"]


def test_a_second_catch_all_is_refused(client, flat):
    """A UNIQUE constraint does not constrain NULLs in Postgres, so this one
    rests on a partial index rather than the obvious constraint."""
    assert make_rule(client, flat, category=None, name="Nights stayed").status_code == 201
    assert make_rule(client, flat, category=None, name="Nights again").status_code == 409


@pytest.mark.parametrize(
    ("shares", "expected"),
    [
        ([], 422),
        ([{"user_id": "00000000-0000-0000-0000-000000000000", "weight": "1"}], 400),
        ([{"user_id": None, "weight": "0"}], 422),
    ],
)
def test_bad_shares_are_refused(client, flat, shares, expected):
    for share in shares:
        if share.get("user_id") is None:
            share["user_id"] = flat["alice"]["id"]
    assert make_rule(client, flat, shares=shares).status_code == expected


def test_the_same_person_cannot_appear_twice(client, flat):
    response = make_rule(
        client,
        flat,
        shares=[
            {"user_id": flat["alice"]["id"], "weight": "14"},
            {"user_id": flat["alice"]["id"], "weight": "12"},
        ],
    )
    assert response.status_code == 400


def test_a_rule_can_be_reweighted(client, flat):
    rule = make_rule(client, flat).json()
    response = client.patch(
        f"/api/groups/{flat['group_id']}/split-rules/{rule['id']}",
        json={
            "shares": [
                {"user_id": flat["alice"]["id"], "weight": "1"},
                {"user_id": flat["bob"]["id"], "weight": "1"},
            ]
        },
        headers=flat["headers"],
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["shares"]) == 2
    assert response.json()["share_percent"][flat["alice"]["id"]] == "50.0"


def test_the_category_cannot_be_moved(client, flat):
    """Silently repointing a rule at another category changes what every future
    expense in it costs. Delete and recreate instead."""
    rule = make_rule(client, flat).json()
    response = client.patch(
        f"/api/groups/{flat['group_id']}/split-rules/{rule['id']}",
        json={"category": "GROCERIES"},
        headers=flat["headers"],
    )
    assert response.status_code == 200
    assert response.json()["category"] == "RENT"


# --- applying rules ------------------------------------------------------


def test_rent_splits_by_room_size_without_being_asked(client, flat):
    make_rule(client, flat)
    body = post_expense(client, flat).json()

    # 3600 by 14/12/10 out of 36 = 1400 / 1200 / 1000.
    assert owed(body) == {
        "alice@example.com": Decimal("1400.00"),
        "bob@example.com": Decimal("1200.00"),
        "carol@example.com": Decimal("1000.00"),
    }
    assert body["split_type"] == "WEIGHT"
    assert body["split_rule"]["name"] == "Rent by room size"


def test_splits_still_land_on_exact_cents(client, flat):
    make_rule(client, flat)
    body = post_expense(client, flat, total_amount="100.00").json()
    assert sum(owed(body).values()) == Decimal("100.00")


def test_an_expense_in_another_category_is_untouched(client, flat):
    make_rule(client, flat)
    body = post_expense(client, flat, category="GROCERIES", total_amount="90.00").json()
    assert set(owed(body).values()) == {Decimal("30.00")}
    assert body["split_rule"] is None


def test_naming_participants_beats_the_rule(client, flat):
    """Whoever names participants wins. An expense that says exactly who is on
    it must never be quietly re-split by a rule set last month."""
    make_rule(client, flat)
    body = post_expense(
        client,
        flat,
        total_amount="100.00",
        participants=[{"user_id": flat["alice"]["id"]}, {"user_id": flat["bob"]["id"]}],
    ).json()

    assert owed(body) == {
        "alice@example.com": Decimal("50.00"),
        "bob@example.com": Decimal("50.00"),
    }
    assert body["split_rule"] is None


def test_the_rule_can_be_switched_off_for_one_expense(client, flat):
    make_rule(client, flat)
    body = post_expense(client, flat, total_amount="90.00", apply_split_rule=False).json()
    assert set(owed(body).values()) == {Decimal("30.00")}
    assert body["split_rule"] is None


def test_a_catch_all_rule_claims_every_category(client, flat):
    """The trip case: nights stayed decide everything, not one category."""
    make_rule(
        client,
        flat,
        name="Nights stayed",
        category=None,
        shares=[
            {"user_id": flat["alice"]["id"], "weight": "5"},
            {"user_id": flat["bob"]["id"], "weight": "5"},
        ],
    )
    body = post_expense(client, flat, category="EATING_OUT", total_amount="100.00").json()
    assert owed(body) == {
        "alice@example.com": Decimal("50.00"),
        "bob@example.com": Decimal("50.00"),
    }


def test_a_named_rule_beats_the_catch_all(client, flat):
    make_rule(client, flat)  # RENT, 14/12/10
    make_rule(
        client,
        flat,
        name="Everything else",
        category=None,
        shares=[{"user_id": flat["alice"]["id"], "weight": "1"}],
    )
    body = post_expense(client, flat).json()
    assert body["split_rule"]["name"] == "Rent by room size"


def test_an_uncategorised_expense_only_matches_the_catch_all(client, flat):
    """Guessing which named rule an uncategorised expense meant would be worse
    than not applying one."""
    make_rule(client, flat)
    body = post_expense(client, flat, category=None, total_amount="90.00").json()
    assert body["split_rule"] is None
    assert set(owed(body).values()) == {Decimal("30.00")}


# --- rules and people who leave ------------------------------------------


def test_a_departed_member_drops_out_and_the_rest_are_reweighted(client, flat):
    """The remaining rooms are still the sizes they were."""
    make_rule(client, flat)
    client.delete(
        f"/api/groups/{flat['group_id']}/members/{flat['carol']['id']}", headers=flat["headers"]
    )

    body = post_expense(client, flat, total_amount="2600.00").json()
    # 2600 by 14/12 out of 26 = 1400 / 1200.
    assert owed(body) == {
        "alice@example.com": Decimal("1400.00"),
        "bob@example.com": Decimal("1200.00"),
    }


def test_a_rule_nobody_is_left_in_is_ignored_not_fatal(client, flat):
    """Falling back to an equal split beats refusing to record rent at all."""
    make_rule(client, flat, shares=[{"user_id": flat["bob"]["id"], "weight": "1"}])
    client.delete(
        f"/api/groups/{flat['group_id']}/members/{flat['bob']['id']}", headers=flat["headers"]
    )

    response = post_expense(client, flat, total_amount="100.00")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["split_rule"] is None
    assert set(owed(body).keys()) == {"alice@example.com", "carol@example.com"}


# --- deleting ------------------------------------------------------------


def test_deleting_a_rule_leaves_settled_money_alone(client, flat):
    make_rule(client, flat)
    expense = post_expense(client, flat).json()
    before = owed(expense)

    rule_id = expense["split_rule"]["id"]
    assert (
        client.delete(
            f"/api/groups/{flat['group_id']}/split-rules/{rule_id}", headers=flat["headers"]
        ).status_code
        == 204
    )

    after = client.get(f"/api/expenses/{expense['id']}", headers=flat["headers"]).json()
    assert owed(after) == before
    assert after["split_rule"] is None, "the split stands; it just stops naming a rule"


def test_only_an_owner_can_delete(client, flat):
    rule = make_rule(client, flat).json()
    response = client.delete(
        f"/api/groups/{flat['group_id']}/split-rules/{rule['id']}", headers=flat["bob_headers"]
    )
    assert response.status_code == 403


def test_a_rule_from_another_group_is_not_found(client, flat, bob):
    _bob_user, bob_headers = bob
    rule = make_rule(client, flat).json()
    other = client.post(
        "/api/groups", json={"name": "Eilat", "type": "TRIP"}, headers=bob_headers
    ).json()

    response = client.get(f"/api/groups/{other['id']}/split-rules", headers=bob_headers)
    assert response.json() == []

    response = client.delete(
        f"/api/groups/{other['id']}/split-rules/{rule['id']}", headers=bob_headers
    )
    assert response.status_code == 404


def test_an_outsider_sees_nothing(client, flat, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    assert (
        client.get(f"/api/groups/{flat['group_id']}/split-rules", headers=dave_headers).status_code
        == 403
    )
    assert make_rule(client, flat, headers=dave_headers).status_code == 403


# --- editing an expense a rule split -------------------------------------


def test_changing_the_amount_keeps_the_rule_weights(client, flat):
    make_rule(client, flat)
    expense = post_expense(client, flat).json()

    response = client.patch(
        f"/api/expenses/{expense['id']}",
        json={"total_amount": "1800.00"},
        headers=flat["headers"],
    )
    assert response.status_code == 200, response.text
    # Half the rent, still 14/12/10.
    assert owed(response.json()) == {
        "alice@example.com": Decimal("700.00"),
        "bob@example.com": Decimal("600.00"),
        "carol@example.com": Decimal("500.00"),
    }


def test_recategorising_an_expense_does_not_re_split_it(client, flat):
    """Rules apply when an expense is created, not when it is edited. Editing a
    category is a correction; silently redividing money already recorded is not
    what anyone means by one."""
    make_rule(client, flat)
    expense = post_expense(client, flat, category="GROCERIES", total_amount="90.00").json()
    assert set(owed(expense).values()) == {Decimal("30.00")}

    response = client.patch(
        f"/api/expenses/{expense['id']}", json={"category": "RENT"}, headers=flat["headers"]
    )
    assert response.status_code == 200, response.text
    assert set(owed(response.json()).values()) == {Decimal("30.00")}
    assert response.json()["split_rule"] is None
