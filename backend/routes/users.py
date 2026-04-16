import hmac
import os

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.utils.auth_token import encode as encode_token, decode as decode_token, InvalidTokenError

router = APIRouter(prefix="/user")


class ChildInfo(BaseModel):
    id: str
    name: str
    preferences: dict


class UserMeResponse(BaseModel):
    user_id: str | None
    name: str | None
    children: list[ChildInfo]


class UserByChatIdResponse(BaseModel):
    user_id: str
    name: str


@router.get("/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    try:
        chat_id = decode_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            user_row = cur.fetchone()
            if not user_row:
                return {"user_id": None, "name": None, "children": []}
            cur.execute(
                """SELECT c.id, c.name, c.preferences FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s ORDER BY c.created_at, c.id""",
                (str(user_row[0]),),
            )
            child_rows = cur.fetchall()
    children = [
        {"id": str(r[0]), "name": r[1], "preferences": r[2]}
        for r in child_rows
    ]
    return {"user_id": str(user_row[0]), "name": user_row[1], "children": children}


@router.get("/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(row[0]), "name": row[1]}


class RegisterLinkRequest(BaseModel):
    telegram_chat_id: int


class RegisterLinkResponse(BaseModel):
    token: str
    onboarding_url: str


@router.post("/register-link", response_model=RegisterLinkResponse)
def register_link(
    req: RegisterLinkRequest,
    x_n8n_secret: str | None = Header(default=None, alias="X-N8N-Secret"),
):
    expected = os.environ.get("N8N_SHARED_SECRET")
    if not expected or not hmac.compare_digest(x_n8n_secret or "", expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-N8N-Secret header")
    token = encode_token(req.telegram_chat_id)
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="FRONTEND_URL is not configured")
    return {
        "token": token,
        "onboarding_url": f"{frontend_url}/onboarding?token={token}",
    }
