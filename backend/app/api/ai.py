"""AI ingestion endpoints: a photo, a voice note or an email in, a draft out.

Nothing here creates an expense. A draft goes back to a person, and what they
confirm is posted to the ordinary expense endpoint.
"""

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.ai import receipt_ocr
from app.config import settings
from app.core.deps import GroupMembership
from app.schemas.ai import ReceiptLineOut, ReceiptScanOut
from app.services import group_service

router = APIRouter(prefix="/groups", tags=["ai"])


@router.post("/{group_id}/receipts/scan", response_model=ReceiptScanOut)
def scan_receipt(
    membership: GroupMembership,
    file: Annotated[UploadFile, File(description="A JPEG, PNG or WebP photo of the receipt.")],
) -> ReceiptScanOut:
    """Read a receipt photo into a draft expense. Stores nothing.

    The lines, total, date and category come back for a person to correct;
    `warnings` names what could not be read. 503 when scanning is not
    configured on this server.
    """
    # A closed group would refuse the expense anyway. Better to say so before
    # someone spends a minute checking every line.
    group_service.require_open(membership.group)

    # One byte past the limit is enough to know it is too big.
    data = file.file.read(settings.receipt_max_bytes + 1)
    draft = receipt_ocr.scan(data, group_currency=membership.group.currency)
    return ReceiptScanOut(
        merchant=draft.merchant,
        expense_date=draft.expense_date,
        total_amount=draft.total_amount,
        currency=draft.currency,
        category=draft.category,
        lines=[ReceiptLineOut(name=line.name, amount=line.amount) for line in draft.lines],
        warnings=draft.warnings,
        ai_metadata=draft.metadata,
    )
