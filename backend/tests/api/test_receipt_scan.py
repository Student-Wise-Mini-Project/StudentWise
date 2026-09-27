"""Receipt scanning endpoint tests.

Claude is stubbed throughout, as in test_nl_query.py: these tests are about the
endpoint -- who may call it, what it refuses, what it returns -- and cost
nothing to run. One test swaps in a fake SDK client instead, to check the
request that would really be sent.
"""

import base64
from types import SimpleNamespace

import pytest

from app.ai import receipt_ocr
from app.ai.receipt_ocr import ExtractedLine, ExtractedReceipt
from app.config import settings

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

READ = ExtractedReceipt(
    is_receipt=True,
    merchant="Shufersal",
    date="2026-09-20",
    currency="ILS",
    total="45.80",
    category="GROCERIES",
    category_text="supermarket",
    lines=[
        ExtractedLine(name="Milk", amount="7.90"),
        ExtractedLine(name="Bread", amount="12.90"),
        ExtractedLine(name="Cheese", amount="25.00"),
    ],
)


@pytest.fixture
def stub_claude(monkeypatch):
    """Make Claude return a chosen reading, and record what it was sent."""
    calls = []

    def _stub(result: ExtractedReceipt = READ):
        def fake(data, media_type):
            calls.append((data, media_type))
            return result

        monkeypatch.setattr(receipt_ocr, "read_receipt", fake)
        return calls

    return _stub


@pytest.fixture
def flat(client, alice, bob):
    alice_user, headers = alice
    _, bob_headers = bob
    group = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )
    return {"group_id": group["id"], "headers": headers, "bob_headers": bob_headers}


def scan(client, flat, data=PNG, headers=None, content_type="image/png"):
    return client.post(
        f"/api/groups/{flat['group_id']}/receipts/scan",
        files={"file": ("receipt.png", data, content_type)},
        headers=headers or flat["headers"],
    )


# --- the happy path ------------------------------------------------------------


def test_a_scan_returns_a_draft(client, flat, stub_claude):
    stub_claude()
    response = scan(client, flat)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["merchant"] == "Shufersal"
    assert body["expense_date"] == "2026-09-20"
    assert body["total_amount"] == "45.80"
    assert body["category"] == "GROCERIES"
    assert body["lines"] == [
        {"name": "Milk", "amount": "7.90"},
        {"name": "Bread", "amount": "12.90"},
        {"name": "Cheese", "amount": "25.00"},
    ]
    assert body["warnings"] == []
    assert body["ai_metadata"]["ocr"]["category_text"] == "supermarket"


def test_the_image_reaches_the_model_with_its_real_type(client, flat, stub_claude):
    calls = stub_claude()
    scan(client, flat, content_type="application/octet-stream")
    assert calls == [(PNG, "image/png")]


def test_any_member_can_scan(client, flat, stub_claude):
    stub_claude()
    assert scan(client, flat, headers=flat["bob_headers"]).status_code == 200


def test_scanning_stores_nothing(client, flat, stub_claude, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "receipt_storage_dir", str(tmp_path / "receipts"))
    stub_claude()
    scan(client, flat)

    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert listed["total"] == 0
    assert not (tmp_path / "receipts").exists()


def test_a_draft_can_be_saved_as_it_came_back(client, flat, stub_claude, alice):
    """The whole flow the review screen drives: scan, confirm, save."""
    stub_claude()
    draft = scan(client, flat).json()

    response = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": draft["merchant"],
            "total_amount": draft["total_amount"],
            "expense_date": draft["expense_date"],
            "payer_id": alice[0]["id"],
            "category": draft["category"],
            "split_type": "EXACT",
            "source": "OCR",
            "items": [{**line, "user_ids": []} for line in draft["lines"]],
            "ai_metadata": draft["ai_metadata"],
        },
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    assert len(response.json()["items"]) == 3


# --- warnings --------------------------------------------------------------------


def test_what_could_not_be_read_comes_back_as_warnings(client, flat, stub_claude):
    stub_claude(READ.model_copy(update={"total": None, "date": None, "currency": "EUR"}))
    body = scan(client, flat).json()
    assert set(body["warnings"]) == {"TOTAL_MISSING", "DATE_MISSING", "CURRENCY_MISMATCH"}
    assert body["total_amount"] == "45.80"  # the lines, since the total was unreadable


# --- what is refused ---------------------------------------------------------------


def test_outsiders_cannot_scan_into_a_group(client, flat, stub_claude, make_user):
    stub_claude()
    _, stranger = make_user(email="mallory@example.com", name="Mallory")
    assert scan(client, flat, headers=stranger).status_code in (403, 404)


def test_a_file_that_is_not_an_image_is_refused_before_the_model_sees_it(client, flat, stub_claude):
    calls = stub_claude()
    response = scan(client, flat, data=b"<html>not a receipt</html>", content_type="image/png")
    assert response.status_code == 400
    assert calls == []


def test_an_oversized_photo_is_refused(client, flat, stub_claude, monkeypatch):
    stub_claude()
    monkeypatch.setattr(settings, "receipt_max_bytes", 32)
    assert scan(client, flat, data=PNG + b"\x00" * 64).status_code == 400


def test_a_photo_that_is_not_a_receipt_is_refused(client, flat, stub_claude):
    stub_claude(READ.model_copy(update={"is_receipt": False, "lines": []}))
    response = scan(client, flat)
    assert response.status_code == 400
    assert "receipt" in response.json()["detail"]


def test_a_closed_group_is_refused_before_the_model_is_called(client, flat, stub_claude):
    calls = stub_claude()
    client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])
    assert scan(client, flat).status_code == 409
    assert calls == []


def test_without_an_api_key_the_endpoint_reports_503(client, flat, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    response = scan(client, flat)
    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


# --- the request that would really be sent ------------------------------------------


def test_the_request_to_claude_carries_the_image_and_the_schema(client, flat, monkeypatch):
    sent = {}

    class FakeMessages:
        def parse(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(stop_reason="end_turn", parsed_output=READ)

    class FakeClient:
        messages = FakeMessages()

        def with_options(self, **options):
            sent["options"] = options
            return self

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(receipt_ocr, "_client", lambda: FakeClient())

    assert scan(client, flat).status_code == 200

    assert sent["model"] == settings.receipt_ocr_model
    assert sent["output_format"] is ExtractedReceipt
    image, text = sent["messages"][0]["content"]
    assert image["type"] == "image"
    assert image["source"] == {
        "type": "base64",
        "media_type": "image/png",
        "data": base64.standard_b64encode(PNG).decode("ascii"),
    }
    assert text["type"] == "text"
    # The instructions tell the model to treat receipt text as data.
    assert any("never instructions" in block["text"] for block in sent["system"])
    assert sent["options"]["max_retries"] == 1


def test_a_refusal_is_a_clean_error(client, flat, monkeypatch):
    class FakeClient:
        class messages:  # noqa: N801 -- mirrors the SDK attribute
            @staticmethod
            def parse(**kwargs):
                return SimpleNamespace(stop_reason="refusal", parsed_output=None)

        def with_options(self, **options):
            return self

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(receipt_ocr, "_client", lambda: FakeClient())
    assert scan(client, flat).status_code == 400
