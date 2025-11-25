# Внешние зависимости
import sys
import re
from typing import Tuple, Any
from base64 import b64encode, b64decode
sys.path.append('/app/pycades')
import pycades


# Получаем хэш из байт-кода документа
def get_hash_from_bytes(data: bytes) -> Tuple[str, Any]:
    hashed_data = pycades.HashedData()
    hashed_data.DataEncoding = pycades.CADESCOM_BASE64_TO_BINARY
    hashed_data.Algorithm = (
        pycades.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256
    )

    hashed_data.Hash(b64encode(data).decode())
    return hashed_data.Value, hashed_data


def clean_signature(signature):
    """Очищает подпись от переносов строк и лишних пробелов"""
    # Убираем все переносы строк и лишние пробелы
    cleaned = re.sub(r'\s+', '', signature)
    return cleaned

# Проверяем подпись
def verify_signature(hashed_data: Any, signature: str):
    print("hashed_data", type(hashed_data), hashed_data)
    print("signature", type(signature), signature)

    # Очищаем подпись
    cleaned_signature = clean_signature(signature)
    print("cleaned_signature", type(cleaned_signature), cleaned_signature[:100] + "...")

    # Проверяем формат Base64
    try:
        # Декодируем для проверки
        decoded_bytes = b64decode(cleaned_signature)
        print(f"✓ Подпись валидная Base64, размер: {len(decoded_bytes)} байт")
    except Exception as e:
        print(f"❌ Ошибка Base64: {e}")
        return False

    signedData = pycades.SignedData()
    signedData.VerifyHash(hashed_data, cleaned_signature, pycades.CADESCOM_CADES_BES)
    print(signedData)
    print(dir(signedData))