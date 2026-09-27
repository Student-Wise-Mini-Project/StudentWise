"""Turning a Gmail API message into something the bill reader can use.

Built against dictionaries shaped like `messages.get(format="full")`
responses, so no Google account is involved.
"""

import base64

from app.ai.gmail import (
    MAX_ATTACHMENT_BYTES,
    bill_search_query,
    message_from_payload,
)

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"


def b64(data: bytes | str) -> str:
    raw = data.encode() if isinstance(data, str) else data
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def message(*parts, headers=None, internal="1758369600000"):
    return {
        "id": "m1",
        "internalDate": internal,
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": headers
            or [
                {"name": "From", "value": "Israel Electric <noreply@iec.co.il>"},
                {"name": "Subject", "value": "חשבון החשמל שלך"},
            ],
            "parts": list(parts),
        },
    }


def text(mime, body):
    return {"mimeType": mime, "body": {"data": b64(body), "size": len(body)}}


def attachment(mime, filename, attachment_id="att1", size=1000):
    return {
        "mimeType": mime,
        "filename": filename,
        "body": {"attachmentId": attachment_id, "size": size},
    }


def no_loads(attachment_id):
    raise AssertionError(f"should not have loaded {attachment_id}")


def test_headers_body_and_date_are_read():
    email = message_from_payload(message(text("text/plain", "סה״כ לתשלום 412.30")), no_loads)
    assert email.id == "m1"
    assert email.sender == "noreply@iec.co.il"
    assert email.subject == "חשבון החשמל שלך"
    assert "412.30" in email.text
    assert email.received_at is not None and email.received_at.year == 2025


def test_plain_text_is_preferred_over_html():
    alternative = {
        "mimeType": "multipart/alternative",
        "parts": [text("text/plain", "plain"), text("text/html", "<b>html</b>")],
    }
    assert message_from_payload(message(alternative), no_loads).text == "plain"


def test_html_only_is_reduced_to_text():
    html = "<html><style>p{}</style><body><p>Total&nbsp;<b>412.30</b> &#8362;</p></body></html>"
    email = message_from_payload(message(text("text/html", html)), no_loads)
    assert email.text == "Total 412.30 ₪"


def test_a_pdf_attachment_is_fetched_by_reference():
    loaded = []

    def load(attachment_id):
        loaded.append(attachment_id)
        return PDF

    email = message_from_payload(message(attachment("application/pdf", "bill.pdf")), load)
    assert loaded == ["att1"]
    assert [(a.filename, a.mime_type, a.data) for a in email.attachments] == [
        ("bill.pdf", "application/pdf", PDF)
    ]


def test_a_pdf_sent_as_octet_stream_is_still_a_pdf():
    email = message_from_payload(
        message(attachment("application/octet-stream", "BILL.PDF")), lambda _: PDF
    )
    assert email.attachments[0].mime_type == "application/pdf"


def test_other_attachments_and_oversized_ones_are_ignored():
    email = message_from_payload(
        message(
            attachment("application/zip", "stuff.zip", "a"),
            attachment("application/pdf", "huge.pdf", "b", size=MAX_ATTACHMENT_BYTES + 1),
        ),
        no_loads,
    )
    assert email.attachments == []


def test_an_inline_image_is_decoded_without_a_fetch():
    part = {"mimeType": "image/png", "filename": "bill.png", "body": {"data": b64(b"\x89PNG")}}
    email = message_from_payload(message(part), no_loads)
    assert email.attachments[0].data == b"\x89PNG"


def test_long_text_is_cut():
    email = message_from_payload(message(text("text/plain", "x" * 50_000)), no_loads)
    assert len(email.text) == 20_000


def test_the_search_asks_for_recent_bills_by_subject_or_known_sender():
    query = bill_search_query(lookback_days=45, trusted_domains=["iec.co.il", "bezeq.co.il"])
    assert query.startswith("newer_than:45d ")
    assert "לתשלום" in query and "חשבונית" in query
    assert "from:(iec.co.il OR bezeq.co.il)" in query
    # A forwarded bill with an empty subject is still found by its file name.
    assert "filename:(bill OR invoice" in query
    # Deliberately not only attachments: plenty of bills are in the body.
    assert "has:attachment" not in query
