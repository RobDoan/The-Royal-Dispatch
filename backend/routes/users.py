import glob
import hmac
import json
import os

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.utils.auth_token import encode as encode_token, decode as decode_token, InvalidTokenError
from backend.utils.mem0_client import get_memory

router = APIRouter(prefix="/user")


def list_personas_ids() -> set[str]:
    """Return set of valid persona ids (YAML basenames in backend/personas)."""
    personas_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas")
    ids = set()
    for path in glob.glob(os.path.join(personas_dir, "*.yaml")):
        ids.add(os.path.splitext(os.path.basename(path))[0])
    return ids


def delete_child_memories(child_id: str) -> None:
    """Best-effort purge of mem0 memories for a deleted child."""
    try:
        mem = get_memory()
        mem.delete_all(user_id=str(child_id))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("mem0 delete_all failed for child %s: %s", child_id, exc)


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


class ChildPreferences(BaseModel):
    favorite_princesses: list[str] = []


class ChildUpdate(BaseModel):
    id: str | None = None
    name: str
    preferences: ChildPreferences


class UpdateUserRequest(BaseModel):
    name: str
    children: list[ChildUpdate]


MAX_FAVORITES = 5


@router.put("/me", response_model=UserMeResponse)
def put_user_me(req: UpdateUserRequest, token: str = Query(...)):
    try:
        chat_id = decode_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name must not be empty")
    if not req.children:
        raise HTTPException(status_code=422, detail="At least one child is required")

    valid_personas = list_personas_ids()
    # Validate each child up-front
    seen_names: set[str] = set()
    for c in req.children:
        cname = (c.name or "").strip()
        if not cname:
            raise HTTPException(status_code=422, detail="Each child must have a name")
        if cname.lower() in seen_names:
            raise HTTPException(status_code=409, detail=f"You already have a child named '{cname}'")
        seen_names.add(cname.lower())
        if len(c.preferences.favorite_princesses) > MAX_FAVORITES:
            raise HTTPException(status_code=422, detail=f"At most {MAX_FAVORITES} favorite characters per child")
        for pid in c.preferences.favorite_princesses:
            if pid not in valid_personas:
                raise HTTPException(status_code=422, detail=f"Unknown character: {pid}")

    removed_child_ids: list[str] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Upsert user
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            user_row = cur.fetchone()
            if user_row is None:
                cur.execute(
                    """INSERT INTO users (telegram_chat_id, name)
                       VALUES (%s, %s)
                       RETURNING id, name""",
                    (chat_id, name),
                )
                user_row = cur.fetchone()
            else:
                cur.execute(
                    "UPDATE users SET name = %s WHERE id = %s RETURNING id, name",
                    (name, str(user_row[0])),
                )
                user_row = cur.fetchone()
            user_id = str(user_row[0])

            # Existing children
            cur.execute(
                "SELECT child_id FROM user_children WHERE user_id = %s",
                (user_id,),
            )
            existing_ids = {str(r[0]) for r in cur.fetchall()}
            submitted_ids = {c.id for c in req.children if c.id}

            # Reconcile each submitted child
            for c in req.children:
                cname = c.name.strip()
                prefs_json = json.dumps({"favorite_princesses": c.preferences.favorite_princesses})
                if c.id and c.id in existing_ids:
                    cur.execute(
                        """UPDATE children SET name = %s, preferences = %s
                           WHERE id = %s""",
                        (cname, prefs_json, c.id),
                    )
                else:
                    cur.execute(
                        """INSERT INTO children (name, preferences)
                           VALUES (%s, %s)
                           RETURNING id""",
                        (cname, prefs_json),
                    )
                    new_id = str(cur.fetchone()[0])
                    cur.execute(
                        """INSERT INTO user_children (user_id, child_id) VALUES (%s, %s)""",
                        (user_id, new_id),
                    )

            # Delete children no longer in list
            to_remove = existing_ids - submitted_ids
            for rid in to_remove:
                cur.execute("DELETE FROM children WHERE id = %s", (rid,))
                removed_child_ids.append(rid)

            # Final read
            cur.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            final_user = cur.fetchone()
            cur.execute(
                """SELECT c.id, c.name, c.preferences FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s ORDER BY c.created_at, c.id""",
                (user_id,),
            )
            child_rows = cur.fetchall()

    # Mem0 cleanup (best-effort, after transaction)
    for cid in removed_child_ids:
        delete_child_memories(cid)

    return {
        "user_id": str(final_user[0]),
        "name": final_user[1],
        "children": [
            {"id": str(r[0]), "name": r[1], "preferences": r[2]}
            for r in child_rows
        ],
    }
