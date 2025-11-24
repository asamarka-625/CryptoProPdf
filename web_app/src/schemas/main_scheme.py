# Внешние зависимости
from typing import Optional
from pydantic import BaseModel


# Схема запроса
class SignRequest(BaseModel):
    document_id: str
    signature: str
    signature_timestamp: Optional[str] = None


# Схема файла
class DocumentInfo(BaseModel):
    document_id: str
    file_path: str
    hash: str