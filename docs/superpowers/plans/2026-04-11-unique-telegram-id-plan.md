# Unique Telegram Chat ID Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate `telegram_chat_id` during user creation and display the specific error message in the Admin UI.

**Architecture:** 
- **Backend:** Add a check in `admin_create_user` to verify if `telegram_chat_id` already exists in the `users` table. Raise `HTTPException(400)` if it does.
- **Frontend:** Update the API client to extract error details from the response and update the `UsersTable` component to display this detail.

**Tech Stack:** FastAPI (Python), Next.js (TypeScript), Tailwind CSS.

---

### Task 1: Backend - Write Failing Test for Duplicate Chat ID

**Files:**
- Modify: `backend/tests/test_admin_routes.py`

- [ ] **Step 1: Write the failing test**
```python
def test_create_user_fails_if_telegram_chat_id_exists(mocker):
    # Mock connection to return an existing user when checking uniqueness
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=("uuid-existing", "Existing User", 12345, "tk_existing", datetime(2026, 1, 1)))
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "New User", "telegram_chat_id": 12345})
    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram chat ID already in use"
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd backend && uv run pytest tests/test_admin_routes.py::test_create_user_fails_if_telegram_chat_id_exists -v`
Expected: FAIL (likely 201 created or error due to mock behavior if not handled)

- [ ] **Step 3: Commit**
```bash
git add backend/tests/test_admin_routes.py
git commit -m "test: add failing test for duplicate telegram chat id"
```

---

### Task 2: Backend - Implement Uniqueness Check

**Files:**
- Modify: `backend/routes/admin.py`

- [ ] **Step 1: Implement the check in `admin_create_user`**
```python
@router.post("/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check for existing chat id
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
```

- [ ] **Step 2: Run test to verify it passes**
Run: `cd backend && uv run pytest tests/test_admin_routes.py::test_create_user_fails_if_telegram_chat_id_exists -v`
Expected: PASS

- [ ] **Step 3: Run all admin route tests to ensure no regressions**
Run: `cd backend && uv run pytest tests/test_admin_routes.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**
```bash
git add backend/routes/admin.py
git commit -m "feat: implement telegram chat id uniqueness check in backend"
```

---

### Task 3: Frontend - Update API Client to Return Error Details

**Files:**
- Modify: `admin/lib/api.ts`

- [ ] **Step 1: Update `createUser` to handle error responses**
```typescript
export async function createUser(name: string, telegram_chat_id: number): Promise<User> {
  const res = await fetch(`${API_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegram_chat_id }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create user');
  }
  return res.json();
}
```

- [ ] **Step 2: Commit**
```bash
git add admin/lib/api.ts
git commit -m "feat: update frontend api client to extract backend error details"
```

---

### Task 4: Frontend - Update UI to Display Specific Error

**Files:**
- Modify: `admin/components/UsersTable.tsx`

- [ ] **Step 1: Update `handleCreate` to use error message from catch**
```typescript
    try {
      const user = await createUser(name.trim(), parseInt(chatId.trim(), 10));
      setUsers((prev) => [...prev, user]);
      setNewToken(user.token);
      setName('');
      setChatId('');
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
```

- [ ] **Step 2: Commit**
```bash
git add admin/components/UsersTable.tsx
git commit -m "feat: display specific backend error in UsersTable component"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run backend tests one last time**
Run: `cd backend && uv run pytest tests/test_admin_routes.py -v`

- [ ] **Step 2: (Optional) Run frontend tests if any exist for UsersTable**
Run: `cd admin && npm run test`
