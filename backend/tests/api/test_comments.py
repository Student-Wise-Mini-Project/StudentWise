"""Comment endpoint tests.

Comments are where the argument about a bill happens, so the rules that matter
are about who can change what someone else said, and whether an edit is visible.
"""

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    """Alice (owner), Bob and Carol, with one expense between Alice and Bob."""
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

    expense = client.post(
        f"/api/groups/{group['id']}/expenses",
        json={
            "title": "Groceries",
            "total_amount": "100.00",
            "expense_date": "2026-09-01",
            "payer_id": alice_user["id"],
            "split_type": "EQUAL",
            "participants": [{"user_id": alice_user["id"]}, {"user_id": bob_user["id"]}],
        },
        headers=headers,
    ).json()

    return {
        "group_id": group["id"],
        "expense_id": expense["id"],
        "headers": headers,
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
        "bob_headers": bob_headers,
        "carol_headers": carol_headers,
    }


def post_comment(client, flat, body="Was this only the two of us?", headers=None):
    return client.post(
        f"/api/expenses/{flat['expense_id']}/comments",
        json={"body": body},
        headers=headers or flat["headers"],
    )


def list_comments(client, flat, headers=None):
    response = client.get(
        f"/api/expenses/{flat['expense_id']}/comments", headers=headers or flat["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- writing -------------------------------------------------------------


def test_a_comment_is_created_and_attributed(client, flat):
    response = post_comment(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["body"] == "Was this only the two of us?"
    assert body["user"]["email"] == "alice@example.com"
    assert body["expense_id"] == flat["expense_id"]
    assert body["edited_at"] is None


def test_a_thread_reads_oldest_first(client, flat):
    post_comment(client, flat, "First")
    post_comment(client, flat, "Second", headers=flat["bob_headers"])
    post_comment(client, flat, "Third")

    page = list_comments(client, flat)
    assert [c["body"] for c in page["items"]] == ["First", "Second", "Third"]
    assert page["total"] == 3


def test_whitespace_is_not_a_comment(client, flat):
    assert post_comment(client, flat, "   ").status_code == 400
    assert post_comment(client, flat, "").status_code == 422


def test_an_overlong_comment_is_rejected(client, flat):
    assert post_comment(client, flat, "x" * 2001).status_code == 422


def test_a_member_who_is_not_on_the_expense_can_still_comment(client, flat):
    """Carol is in the flat but not on this expense -- and "why am I not on
    this?" is exactly the comment worth allowing."""
    assert (
        post_comment(client, flat, "Why not me?", headers=flat["carol_headers"]).status_code == 201
    )


# --- editing -------------------------------------------------------------


def test_only_the_author_can_edit(client, flat):
    comment = post_comment(client, flat).json()
    response = client.patch(
        f"/api/comments/{comment['id']}",
        json={"body": "Actually it was all three"},
        headers=flat["bob_headers"],
    )
    assert response.status_code == 403


def test_editing_stamps_the_comment(client, flat):
    comment = post_comment(client, flat).json()
    response = client.patch(
        f"/api/comments/{comment['id']}",
        json={"body": "Actually it was all three"},
        headers=flat["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["body"] == "Actually it was all three"
    assert body["edited_at"] is not None, "an unmarked edit rewrites history"


def test_resubmitting_the_same_text_is_not_an_edit(client, flat):
    comment = post_comment(client, flat, "Same").json()
    response = client.patch(
        f"/api/comments/{comment['id']}", json={"body": "Same"}, headers=flat["headers"]
    )
    assert response.json()["edited_at"] is None


# --- deleting ------------------------------------------------------------


def test_an_author_can_delete_their_own(client, flat):
    comment = post_comment(client, flat, headers=flat["bob_headers"]).json()
    response = client.delete(f"/api/comments/{comment['id']}", headers=flat["bob_headers"])
    assert response.status_code == 204
    assert list_comments(client, flat)["total"] == 0


def test_the_group_owner_can_delete_anyone_s(client, flat):
    """Somebody has to be able to remove abuse."""
    comment = post_comment(client, flat, headers=flat["bob_headers"]).json()
    assert (
        client.delete(f"/api/comments/{comment['id']}", headers=flat["headers"]).status_code == 204
    )


def test_an_ordinary_member_cannot_delete_someone_else_s(client, flat):
    comment = post_comment(client, flat).json()
    response = client.delete(f"/api/comments/{comment['id']}", headers=flat["carol_headers"])
    assert response.status_code == 403


def test_comments_die_with_their_expense(client, flat):
    """Expenses are hard-deleted here, and a comment about a bill that no longer
    exists has nothing to say."""
    comment = post_comment(client, flat).json()
    assert (
        client.delete(f"/api/expenses/{flat['expense_id']}", headers=flat["headers"]).status_code
        == 204
    )
    assert client.get(f"/api/comments/{comment['id']}", headers=flat["headers"]).status_code == 405
    response = client.patch(
        f"/api/comments/{comment['id']}", json={"body": "hello"}, headers=flat["headers"]
    )
    assert response.status_code == 404


# --- access --------------------------------------------------------------


def test_an_outsider_cannot_read_or_write_comments(client, flat, make_user):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    comment = post_comment(client, flat).json()

    assert (
        client.get(
            f"/api/expenses/{flat['expense_id']}/comments", headers=outsider_headers
        ).status_code
        == 403
    )
    assert post_comment(client, flat, headers=outsider_headers).status_code == 403
    assert (
        client.delete(f"/api/comments/{comment['id']}", headers=outsider_headers).status_code == 403
    )


def test_commenting_requires_authentication(client, flat):
    response = client.post(f"/api/expenses/{flat['expense_id']}/comments", json={"body": "hello"})
    assert response.status_code == 401
