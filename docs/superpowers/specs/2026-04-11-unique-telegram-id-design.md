# Design: Unique Telegram Chat ID Validation & Error Display

## Overview
Refactor the `admin_create_user` API in the Royal Dispatch backend to ensure that a `telegram_chat_id` is unique across all users. This will be enforced at the Python application level. Additionally, update the Admin UI to display the specific error message returned by the backend.

## Architecture & Data Flow
1.  **Request Handling:** The `admin_create_user` endpoint in `backend/routes/admin.py` receives a `CreateUserRequest`.
2.  **Uniqueness Check:** Before inserting the new user, the application will query the `users` table to see if any existing record matches the provided `telegram_chat_id`.
3.  **Error Handling (Backend):**
    - If a user with the same `telegram_chat_id` exists, the API will return a `400 Bad Request` with `{"detail": "Telegram chat ID already in use"}`.
    - If no such user exists, the insertion proceeds as before.
4.  **Error Handling (Frontend):**
    - Update `admin/lib/api.ts` to include the error message from the response body when a request fails.
    - Update `admin/components/UsersTable.tsx` to display the specific error message returned by the API instead of a generic one.

## Components
- **Backend API Endpoint:** `backend/routes/admin.py:admin_create_user`
- **Frontend API Client:** `admin/lib/api.ts:createUser`
- **Frontend Component:** `admin/components/UsersTable.tsx`

## Error Handling
- **Backend Status Code:** `400 Bad Request`
- **Backend Detail:** `"Telegram chat ID already in use"`
- **Frontend Behavior:** Display the `detail` message from the response in the error paragraph below the form.

## Testing Strategy
### Backend
1.  **Test Case:** `test_create_user_fails_if_telegram_chat_id_exists`
2.  **Mocking:** Mock the database connection to return a row when checking for existing chat ID.
3.  **Verification:** Assert that the response status code is `400` and the error detail is correct.
4.  **Regression:** Ensure existing creation tests still pass when the chat ID is unique (mock returns `None` for the check).

### Frontend
1.  **Test Case:** `test_create_user_shows_backend_error_message` in `admin/tests/UsersTable.test.tsx`.
2.  **Mocking:** Mock the `createUser` API call to reject with a specific error message.
3.  **Verification:** Assert that the component displays the error message.

## Trade-offs
- **Python-only Check:** While simpler to implement in code, it is theoretically prone to race conditions (two identical requests processed simultaneously). However, for an admin-only user creation flow, this risk is acceptable. A database `UNIQUE` constraint would be more robust but requires a migration.
