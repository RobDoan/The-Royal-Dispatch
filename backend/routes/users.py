from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db.client import get_conn

router = APIRouter(prefix="/user")


class UserMeResponse(BaseModel):
    user_id: str
    name: str
    config: dict


class UserByChatIdResponse(BaseModel):
    user_id: str
    name: str


@router.get("/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE token = %s", (token,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("SELECT config FROM user_preferences WHERE user_id = %s", (str(user_row[0]),))
            pref_row = cur.fetchone()
    config = pref_row[0] if pref_row else {}
    return {"user_id": str(user_row[0]), "name": user_row[1], "config": config}


@router.get("/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(row[0]), "name": row[1]}
