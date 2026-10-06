"""Registration / login payloads."""

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import IsraeliMobile, UserOut


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone_number: IsraeliMobile = None


class AuthResponse(BaseModel):
    """Returned by both /register and /login."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut
