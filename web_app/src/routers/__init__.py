# Внешние зависимости
from fastapi import APIRouter
# Внутренние модули
from web_app.src.routers.api_router import router as api_router
from web_app.src.routers.html_router import router as html_router


router = APIRouter(prefix="/signature")
router.include_router(api_router)
router.include_router(html_router)