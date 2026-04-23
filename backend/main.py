from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.stories import router as stories_router
from backend.routes.admin import router as admin_router
from backend.routes.users import router as users_router
from backend.routes.call import router as call_router

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stories_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(call_router)
