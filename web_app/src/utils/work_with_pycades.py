# Внешние зависимости
import sys
from typing import Tuple, Any
from base64 import b64encode
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


# Проверяем подпись
def verify_signature(hashed_data: Any, signature: str):
    print("hashed_data", type(hashed_data), hashed_data)
    print("signature", type(signature), signature)
    signedData = pycades.SignedData()
    signedData.VerifyHash(hashed_data, signature, pycades.CADESCOM_CADES_BES)
    print(signedData)
    print(dir(signedData))