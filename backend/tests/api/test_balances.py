"""Balance and settlement-plan endpoint tests."""

from decimal import Decimal

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, _ = make_user(email="carol@example.com", name="Carol")

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
    }


def add_expense(client, flat, payer, amount, **overrides):
    payload = {
        "title": "Thing",
        "total_amount": amount,
        "expense_date": "2026-09-01",
        "payer_id": payer["id"],
        "split_type": "EQUAL",
    }
    payload.update(overrides)
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=flat["headers"]
    ).json()


def balances(client, flat) -> dict[str, Decimal]:
    body = client.get(f"/api/groups/{flat['group_id']}/balances", headers=flat["headers"]).json()
    return {b["user"]["email"]: Decimal(b["net"]) for b in body["balances"]}


def plan(client, flat):
    body = client.get(
        f"/api/groups/{flat['group_id']}/settlement-plan", headers=flat["headers"]
    ).json()
    return [
        (t["from_user"]["email"], t["to_user"]["email"], Decimal(t["amount"]))
        for t in body["transfers"]
    ]


# --- balances ------------------------------------------------------------


def test_empty_group_has_zero_balances(client, flat):
    assert set(balances(client, flat).values()) == {Decimal("0.00")}


def test_balances_always_sum_to_zero(client, flat):
    add_expense(client, flat, flat["alice"], "100.00")
    add_expense(client, flat, flat["bob"], "37.55")
    assert sum(balances(client, flat).values()) == Decimal("0.00")


def test_payer_is_owed_the_rest_of_the_group_share(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    nets = balances(client, flat)
    assert nets["alice@example.com"] == Decimal("60.00")
    assert nets["bob@example.com"] == Decimal("-30.00")
    assert nets["carol@example.com"] == Decimal("-30.00")


def test_breakdown_shows_paid_and_owed(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    body = client.get(f"/api/groups/{flat['group_id']}/balances", headers=flat["headers"]).json()
    alice_row = next(b for b in body["balances"] if b["user"]["email"] == "alice@example.com")
    assert Decimal(alice_row["paid"]) == Decimal("90.00")
    assert Decimal(alice_row["owed"]) == Decimal("30.00")
    assert body["currency"] == "ILS"


def test_an_expense_only_two_share_does_not_touch_the_third(client, flat):
    add_expense(
        client,
        flat,
        flat["alice"],
        "50.00",
        participants=[{"user_id": flat["alice"]["id"]}, {"user_id": flat["bob"]["id"]}],
    )
    nets = balances(client, flat)
    assert nets["carol@example.com"] == Decimal("0.00")
    assert nets["alice@example.com"] == Decimal("25.00")
    assert nets["bob@example.com"] == Decimal("-25.00")


def test_a_settlement_moves_the_balance(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    assert balances(client, flat)["bob@example.com"] == Decimal("-30.00")

    client.post(
        f"/api/groups/{flat['group_id']}/settlements",
        json={
            "from_user_id": flat["bob"]["id"],
            "to_user_id": flat["alice"]["id"],
            "amount": "30.00",
        },
        headers=flat["headers"],
    )
    nets = balances(client, flat)
    assert nets["bob@example.com"] == Decimal("0.00")
    assert nets["alice@example.com"] == Decimal("30.00")


def test_settling_everything_zeroes_the_group(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    for transfer_from, transfer_to, amount in plan(client, flat):
        client.post(
            f"/api/groups/{flat['group_id']}/settlements",
            json={
                "from_user_id": next(
                    flat[k]["id"]
                    for k in ("alice", "bob", "carol")
                    if flat[k]["email"] == transfer_from
                ),
                "to_user_id": next(
                    flat[k]["id"]
                    for k in ("alice", "bob", "carol")
                    if flat[k]["email"] == transfer_to
                ),
                "amount": str(amount),
            },
            headers=flat["headers"],
        )
    assert set(balances(client, flat).values()) == {Decimal("0.00")}
    assert plan(client, flat) == []


def test_rounding_leftovers_still_net_to_zero(client, flat):
    """100/3 leaves a stray cent; the balances must still cancel exactly."""
    add_expense(client, flat, flat["alice"], "100.00")
    assert sum(balances(client, flat).values()) == Decimal("0.00")


def test_a_member_who_left_owing_money_stays_on_the_balance_sheet(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    client.delete(
        f"/api/groups/{flat['group_id']}/members/{flat['bob']['id']}", headers=flat["headers"]
    )
    nets = balances(client, flat)
    assert nets["bob@example.com"] == Decimal("-30.00")


def test_a_member_who_left_square_drops_off_the_balance_sheet(client, flat):
    client.delete(
        f"/api/groups/{flat['group_id']}/members/{flat['bob']['id']}", headers=flat["headers"]
    )
    assert "bob@example.com" not in balances(client, flat)


def test_outsider_cannot_see_balances(client, flat, make_user):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    gid = flat["group_id"]
    assert client.get(f"/api/groups/{gid}/balances", headers=outsider_headers).status_code == 403
    assert (
        client.get(f"/api/groups/{gid}/settlement-plan", headers=outsider_headers).status_code
        == 403
    )


# --- settlement plan -----------------------------------------------------


def test_plan_is_empty_when_nobody_owes_anything(client, flat):
    assert plan(client, flat) == []


def test_plan_for_one_creditor_two_debtors(client, flat):
    add_expense(client, flat, flat["alice"], "90.00")
    transfers = plan(client, flat)
    assert len(transfers) == 2
    assert all(to == "alice@example.com" for _from, to, _amount in transfers)
    assert sum(amount for _f, _t, amount in transfers) == Decimal("60.00")


def test_plan_collapses_a_circular_debt(client, flat):
    """Alice covers Bob, Bob covers Carol, Carol covers Alice -- equal amounts
    cancel out, so nobody should need to transfer anything."""
    for payer in ("alice", "bob", "carol"):
        add_expense(client, flat, flat[payer], "30.00")
    assert set(balances(client, flat).values()) == {Decimal("0.00")}
    assert plan(client, flat) == []


def test_plan_never_needs_more_transfers_than_people_minus_one(client, flat):
    add_expense(client, flat, flat["alice"], "100.00")
    add_expense(client, flat, flat["bob"], "45.50")
    add_expense(client, flat, flat["carol"], "12.30")
    assert len(plan(client, flat)) <= 2
