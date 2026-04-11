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


class PreferencesResponse(BaseModel):
    user_id: str
    config: dict


class UpdatePreferencesRequest(BaseModel):
    config: dict


class PersonaResponse(BaseModel):
    id: str
    name: str


class CreateChildRequest(BaseModel):
    name: str
    timezone: str = "America/Los_Angeles"
    preferences: dict = {}


class ChildResponse(BaseModel):
    id: str
    parent_id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str


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

@router.get("/users/{user_id}/children", response_model=list[ChildResponse])
def admin_list_children(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, parent_id, name, timezone, preferences, created_at FROM children WHERE parent_id = %s ORDER BY created_at",
                (user_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "id": str(r[0]), "parent_id": str(r[1]), "name": r[2],
            "timezone": r[3], "preferences": r[4], "created_at": r[5].isoformat(),
        }
        for r in rows
    ]


@router.post("/users/{user_id}/children", response_model=ChildResponse, status_code=201)
def admin_create_child(user_id: str, req: CreateChildRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute(
                """INSERT INTO children (parent_id, name, timezone, preferences)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, parent_id, name, timezone, preferences, created_at""",
                (user_id, req.name, req.timezone, json.dumps(req.preferences)),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]), "parent_id": str(row[1]), "name": row[2],
        "timezone": row[3], "preferences": row[4], "created_at": row[5].isoformat(),
    }


@router.delete("/children/{child_id}", status_code=204)
def admin_delete_child(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM children WHERE id = %s RETURNING id", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")


# ── Preferences ──────────────────────────────────────────────────────────────

@router.get("/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, config FROM user_preferences WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return {"user_id": str(row[0]), "config": row[1]}


@router.put("/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(user_id: str, req: UpdatePreferencesRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO user_preferences (user_id, config) VALUES (%s, %s)
                   ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config
                   RETURNING user_id, config""",
                (user_id, json.dumps(req.config)),
            )
            row = cur.fetchone()
    return {"user_id": str(row[0]), "config": row[1]}


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
