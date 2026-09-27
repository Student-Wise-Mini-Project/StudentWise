"""Reading a bill out of an email: what is sent to the model, and what comes back.

The model call itself is replaced; these are about the parts around it that
have to be right whatever the model says.
"""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from typing import get_args

import pytest

from app.ai import bill_parser
from app.ai.bill_parser import ExtractedBill, UnreadableEmail, build_bill, read_bill
from app.ai.gmail import EmailAttachment, EmailMessage
from app.ai.receipt_ocr import CategoryName
from app.config import settings
from app.models.enums import ExpenseCategory

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"
LOCKED_PDF = b"%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def email(text="", attachments=()):
    return EmailMessage(
        id="m1",
        sender="noreply@iec.co.il",
        subject="חשבון החשמל",
        received_at=None,
        text=text,
        attachments=list(attachments),
    )


def extracted(**overrides):
    fields = {
        "is_bill": True,
        "provider_name": "חברת החשמל",
        "total_amount": "412.30",
        "currency": "ILS",
        "due_date": "2026-10-15",
        "issue_date": "2026-09-20",
        "billing_period_start": "2026-07-15",
        "billing_period_end": "2026-09-14",
        "billed_to_name": "ישראל ישראלי",
        "service_address": "דיזנגוף 5 תל אביב",
        "invoice_number": "123456789",
        "category": "UTILITIES",
    }
    fields.update(overrides)
    return ExtractedBill(**fields)


# --- build_bill ---------------------------------------------------------------


def test_a_bill_is_parsed_into_exact_values():
    bill = build_bill(extracted())
    assert bill.is_bill
    assert bill.total_amount == Decimal("412.30")
    assert bill.due_date == date(2026, 10, 15)
    assert bill.issue_date == date(2026, 9, 20)
    assert bill.billing_period_end == date(2026, 9, 14)
    assert bill.service_address == "דיזנגוף 5 תל אביב"
    assert bill.category is ExpenseCategory.UTILITIES
    assert bill.metadata["gmail_bill"]["invoice_number"] == "123456789"


def test_not_a_bill_keeps_nothing_but_the_verdict():
    bill = build_bill(extracted(is_bill=False))
    assert not bill.is_bill
    assert bill.total_amount is None and bill.provider_name is None


@pytest.mark.parametrize("amount", ["0.00", "-50.00", "unreadable", None])
def test_an_amount_that_is_not_a_positive_number_is_left_empty(amount):
    assert build_bill(extracted(total_amount=amount)).total_amount is None


def test_unparseable_dates_are_left_empty_not_guessed():
    bill = build_bill(extracted(due_date="15/10/2026", issue_date=""))
    assert bill.due_date is None and bill.issue_date is None


def test_the_model_is_offered_exactly_the_real_categories():
    assert set(get_args(CategoryName)) == {c.value for c in ExpenseCategory}


# --- what is sent -----------------------------------------------------------------


@pytest.fixture
def fake_claude(monkeypatch):
    sent = {}

    class Messages:
        def parse(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(stop_reason="end_turn", parsed_output=extracted())

    class Client:
        messages = Messages()

        def with_options(self, **options):
            return self

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(bill_parser, "_client", lambda: Client())
    return sent


def blocks(sent):
    return sent["messages"][0]["content"]


def test_a_pdf_bill_is_sent_as_a_document_with_the_email_as_data(fake_claude):
    read_bill(email("see attached", [EmailAttachment("bill.pdf", "application/pdf", PDF)]))
    document, envelope = blocks(fake_claude)
    assert document["type"] == "document"
    assert document["source"]["media_type"] == "application/pdf"
    assert envelope["text"].startswith("<email>") and "see attached" in envelope["text"]
    assert any(
        "never instructions" in " ".join(block["text"].split()) for block in fake_claude["system"]
    )
    assert fake_claude["model"] == settings.bill_parser_model


def test_a_password_protected_pdf_is_not_sent_and_is_noted(fake_claude):
    _, notes = read_bill(
        email("סכום לתשלום 412.30", [EmailAttachment("bill.pdf", "application/pdf", LOCKED_PDF)])
    )
    assert [b["type"] for b in blocks(fake_claude)] == ["text"]
    assert notes["encrypted_pdf"] == "bill.pdf"


def test_an_image_bill_is_sent_with_its_real_type(fake_claude):
    read_bill(email("", [EmailAttachment("bill.jpg", "image/jpeg", PNG)]))
    assert blocks(fake_claude)[0]["source"]["media_type"] == "image/png"


def test_only_the_first_document_is_sent(fake_claude):
    read_bill(
        email(
            "",
            [
                EmailAttachment("bill.pdf", "application/pdf", PDF),
                EmailAttachment("terms.pdf", "application/pdf", PDF),
            ],
        )
    )
    assert [b["type"] for b in blocks(fake_claude)] == ["document", "text"]


def test_an_email_with_nothing_readable_is_refused_before_any_call(fake_claude):
    with pytest.raises(UnreadableEmail):
        read_bill(email("   ", [EmailAttachment("bill.pdf", "application/pdf", LOCKED_PDF)]))
    assert fake_claude == {}
