# Внешние зависимости
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
# Внутренние модули
from web_app.src.routers import router


app = FastAPI(title="PDF Signing API")

app.mount("/static", StaticFiles(directory="web_app/src/static"), name="static")

# Подключение маршрутов
app.include_router(router)

# Настройка CORS для работы с фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене укажите конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)