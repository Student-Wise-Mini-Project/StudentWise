"""Where receipt images live.

Local disk in development and Postgres in production (`RECEIPT_STORAGE`), behind
a small interface, because the only thing that has to survive a change of store
is the *key* -- an opaque string kept in `expenses.receipt_image_url`. Nothing
else in the app knows or cares whether a receipt is a file on this machine, a
row, or an object in a bucket.

Two rules hold whatever the backend is:

* **The upload's declared content type is not trusted.** A browser (or an
  attacker) can put anything in that header, so the bytes themselves are
  sniffed and anything that is not a JPEG, PNG or WebP is refused.
* **Keys are generated, never supplied.** A key is built from the expense's
  UUID and a whitelisted extension and is re-checked against a pattern before
  it is ever turned into a path, so no request can walk out of the directory.
"""

import re
import uuid
from pathlib import Path

from sqlalchemy import Connection, Engine, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import db
from app.config import settings
from app.core.errors import BadRequestError, NotFoundError
from app.models.receipt_image import ReceiptImage

#: content type -> the extension we store it under.
ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

#: Leading bytes that actually identify each format.
_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)

_KEY_PATTERN = re.compile(
    r"^receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$"
)


def sniff_image_type(data: bytes) -> str | None:
    """Identify an image from its own bytes, or return None if it is not one."""
    for prefix, content_type in _MAGIC:
        if data.startswith(prefix):
            return content_type
    # WebP is a RIFF container: "RIFF" <4-byte size> "WEBP".
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_receipt_image(data: bytes) -> str:
    """The content type of an acceptable receipt photo, or a 400 saying why not.

    Shared by storing a receipt and scanning one, so both refuse the same files.
    """
    if not data:
        raise BadRequestError("The uploaded file is empty")
    if len(data) > settings.receipt_max_bytes:
        limit_mb = settings.receipt_max_bytes // (1024 * 1024)
        raise BadRequestError(f"Receipts must be {limit_mb} MB or smaller")

    content_type = sniff_image_type(data)
    if content_type is None:
        raise BadRequestError("Upload a JPEG, PNG or WebP image")
    return content_type


def content_type_for(key: str) -> str:
    extension = key.rsplit(".", 1)[-1]
    for content_type, ext in ALLOWED_IMAGE_TYPES.items():
        if ext == extension:
            return content_type
    raise NotFoundError("Receipt not found")


class LocalReceiptStore:
    """Receipts as files under one directory, named by expense id.

    One receipt per expense, so saving a second one replaces the first rather
    than leaking an orphan file that nothing points at any more.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        if not _KEY_PATTERN.match(key):
            # Only ever reachable if a key was written by something other than
            # `save` -- which is exactly the case worth refusing loudly.
            raise NotFoundError("Receipt not found")
        return self.root / Path(key).name

    def save(self, *, expense_id: uuid.UUID, data: bytes) -> str:
        content_type = validate_receipt_image(data)
        key = f"receipts/{expense_id}.{ALLOWED_IMAGE_TYPES[content_type]}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def read(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            # The row says there is a receipt and the file is gone. Reporting it
            # as missing is honest; pretending otherwise would hide data loss.
            raise NotFoundError("Receipt file is missing from storage")
        return path.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class DatabaseReceiptStore:
    """Receipts as rows in `receipt_images`, for a host with no lasting disk.

    It behaves like a bucket that happens to live in Postgres: every call runs
    in its own short transaction, exactly as a file write or an S3 PUT happens
    whether or not the caller's transaction later commits. That is what keeps
    the expense service storage-agnostic -- it already saves before its commit
    and deletes after it, and that ordering is right for both stores.

    The key is the same `receipts/<expense id>.<ext>` the disk store uses, and
    `read`/`delete` match on the extension as well as the expense, so deleting
    the *previous* key after a replacement cannot remove the new image.
    """

    def __init__(self, bind: Engine | Connection) -> None:
        self.bind = bind

    def _session(self) -> Session:
        # create_savepoint: when the tests hand over a connection that is
        # already inside a transaction, "commit" releases a savepoint rather
        # than ending their whole test.
        return Session(bind=self.bind, join_transaction_mode="create_savepoint")

    @staticmethod
    def _parse(key: str) -> tuple[uuid.UUID, str]:
        if not _KEY_PATTERN.match(key):
            raise NotFoundError("Receipt not found")
        return uuid.UUID(Path(key).stem), content_type_for(key)

    def save(self, *, expense_id: uuid.UUID, data: bytes) -> str:
        content_type = validate_receipt_image(data)
        upsert = insert(ReceiptImage).values(
            expense_id=expense_id, content_type=content_type, data=data
        )
        upsert = upsert.on_conflict_do_update(
            index_elements=[ReceiptImage.expense_id],
            set_={"content_type": content_type, "data": data},
        )
        with self._session() as session:
            session.execute(upsert)
            session.commit()
        return f"receipts/{expense_id}.{ALLOWED_IMAGE_TYPES[content_type]}"

    def read(self, key: str) -> bytes:
        expense_id, content_type = self._parse(key)
        with self._session() as session:
            data = session.scalar(
                select(ReceiptImage.data).where(
                    ReceiptImage.expense_id == expense_id,
                    ReceiptImage.content_type == content_type,
                )
            )
        if data is None:
            # Same wording as a missing file: the row says there is a receipt
            # and the image is gone.
            raise NotFoundError("Receipt file is missing from storage")
        return data

    def delete(self, key: str) -> None:
        expense_id, content_type = self._parse(key)
        with self._session() as session:
            session.execute(
                delete(ReceiptImage).where(
                    ReceiptImage.expense_id == expense_id,
                    ReceiptImage.content_type == content_type,
                )
            )
            session.commit()


def get_receipt_store() -> LocalReceiptStore | DatabaseReceiptStore:
    if settings.receipt_storage == "database":
        return DatabaseReceiptStore(db.engine)
    return LocalReceiptStore(Path(settings.receipt_storage_dir))
