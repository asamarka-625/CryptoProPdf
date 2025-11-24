# Внешние зависимости
import sys
sys.path.append('/app/pycades')
import pycades


# Получаем хэш из байт-кода документа
def get_hash_from_bytes(data: bytes) -> str:
    hashed_data = pycades.HashedData()
    hashed_data.DataEncoding = pycades.CADESCOM_BASE64_TO_BINARY
    hashed_data.Algorithm = (
        pycades.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256
    )
    hashed_data.SetData(data)
    hashed_data.Hash()

    return hashed_data.Value


# Проверяем подпись
def verify_signature(hashed_data: bytes, signature: bytes):
    _signedData = pycades.SignedData()
    _signedData.VerifyHash(hashed_data, signature, pycades.CADESCOM_CADES_BES)