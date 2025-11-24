# Внешние зависимости
from typing import Optional, Any
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
    hashed_data: Any