# Внешние зависимости
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates


router = APIRouter(
    tags=["HTML"]
)


templates = Jinja2Templates(directory="web_app/templates")


@router.get("/", response_class=HTMLResponse)
async def main_page(request: Request):
    context = {
        "request": request
    }

    return templates.TemplateResponse('home.html', context=context)