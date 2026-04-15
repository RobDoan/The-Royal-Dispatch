import os
import glob
import json
import secrets

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.client import get_conn

router = APIRouter(prefix="/admin")


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    telegram_chat_id: int


class UserResponse(BaseModel):
    id: str
    name: str
    telegram_chat_id: int
    token: str
    created_at: str


class CreateChildRequest(BaseModel):
    name: str
    timezone: str = "America/Los_Angeles"


class LinkedUserInfo(BaseModel):
    user_id: str
    name: str
    role: str | None


class ChildWithUsersResponse(BaseModel):
    id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str
    users: list[LinkedUserInfo]


class ChildResponse(BaseModel):
    id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str


class LinkUserRequest(BaseModel):
    user_id: str
    role: str | None = None


class UserChildLinkResponse(BaseModel):
    user_id: str
    child_id: str
    role: str | None
    created_at: str


class PreferencesResponse(BaseModel):
    child_id: str
    preferences: dict


class UpdatePreferencesRequest(BaseModel):
    preferences: dict


class PersonaResponse(BaseModel):
    id: str
    name: str


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
def admin_list_users():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, telegram_chat_id, token, created_at FROM users ORDER BY created_at")
            rows = cur.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "telegram_chat_id": r[2], "token": r[3], "created_at": r[4].isoformat()}
        for r in rows
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE telegram_chat_id = %s", (req.telegram_chat_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Telegram chat ID already in use")
            cur.execute(
                """INSERT INTO users (name, telegram_chat_id, token)
                   VALUES (%s, %s, %s)
                   RETURNING id, name, telegram_chat_id, token, created_at""",
                (req.name, req.telegram_chat_id, token),
            )
            row = cur.fetchone()
    return {"id": str(row[0]), "name": row[1], "telegram_chat_id": row[2], "token": row[3], "created_at": row[4].isoformat()}


@router.delete("/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")


# ── Children ─────────────────────────────────────────────────────────────────

@router.get("/children", response_model=list[ChildWithUsersResponse])
def admin_list_children():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT c.id, c.name, c.timezone, c.preferences, c.created_at,
                          u.id, u.name, uc.role
                   FROM children c
                   LEFT JOIN user_children uc ON c.id = uc.child_id
                   LEFT JOIN users u ON uc.user_id = u.id
                   ORDER BY c.created_at"""
            )
            rows = cur.fetchall()

    children_map: dict[str, dict] = {}
    for r in rows:
        cid = str(r[0])
        if cid not in children_map:
            children_map[cid] = {
                "id": cid, "name": r[1], "timezone": r[2],
                "preferences": r[3], "created_at": r[4].isoformat(),
                "users": [],
            }
        if r[5] is not None:
            children_map[cid]["users"].append({
                "user_id": str(r[5]), "name": r[6], "role": r[7],
            })
    return list(children_map.values())


@router.post("/children", response_model=ChildResponse, status_code=201)
def admin_create_child(req: CreateChildRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO children (name, timezone)
                   VALUES (%s, %s)
                   RETURNING id, name, timezone, preferences, created_at""",
                (req.name, req.timezone),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]), "name": row[1], "timezone": row[2],
        "preferences": row[3], "created_at": row[4].isoformat(),
    }


@router.delete("/children/{child_id}", status_code=204)
def admin_delete_child(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM children WHERE id = %s RETURNING id", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")


# ── User-Child Links ────────────────────────────────────────────────────────

@router.post("/children/{child_id}/users", response_model=UserChildLinkResponse, status_code=201)
def admin_link_user_to_child(child_id: str, req: LinkUserRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM children WHERE id = %s", (child_id,))
            child_row = cur.fetchone()
            if not child_row:
                raise HTTPException(status_code=404, detail="Child not found")
            child_name = child_row[0]

            cur.execute(
                """SELECT c.id FROM children c
                   JOIN user_children uc ON c.id = uc.child_id
                   WHERE uc.user_id = %s AND c.name = %s AND c.id != %s""",
                (req.user_id, child_name, child_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"User already has a linked child named '{child_name}'",
                )

            cur.execute(
                """INSERT INTO user_children (user_id, child_id, role)
                   VALUES (%s, %s, %s)
                   RETURNING user_id, child_id, role, created_at""",
                (req.user_id, child_id, req.role),
            )
            row = cur.fetchone()
    return {
        "user_id": str(row[0]), "child_id": str(row[1]),
        "role": row[2], "created_at": row[3].isoformat(),
    }


@router.delete("/children/{child_id}/users/{user_id}", status_code=204)
def admin_unlink_user_from_child(child_id: str, user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM user_children WHERE user_id = %s AND child_id = %s RETURNING user_id",
                (user_id, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Link not found")


# ── Preferences ──────────────────────────────────────────────────────────────

@router.get("/children/{child_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, preferences FROM children WHERE id = %s", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"child_id": str(row[0]), "preferences": row[1]}


@router.put("/children/{child_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(child_id: str, req: UpdatePreferencesRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE children SET preferences = %s WHERE id = %s
                   RETURNING id, preferences""",
                (json.dumps(req.preferences), child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"child_id": str(row[0]), "preferences": row[1]}


# ── Personas ─────────────────────────────────────────────────────────────────

@router.get("/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    personas_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas")
    results = []
    for path in sorted(glob.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results
