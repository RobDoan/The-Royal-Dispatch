from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db.client import get_conn

router = APIRouter(prefix="/user")


class ChildInfo(BaseModel):
    id: str
    name: str
    preferences: dict


class UserMeResponse(BaseModel):
    user_id: str
    name: str
    children: list[ChildInfo]


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
            cur.execute(
                """SELECT c.id, c.name, c.preferences FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s ORDER BY c.created_at""",
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
