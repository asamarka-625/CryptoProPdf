# Внешние зависимости
import uuid
import tempfile
import base64
import aiofiles
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
# Внутренние модули
from web_app.src.schemas import DocumentInfo, SignRequest
from web_app.src.utils import create_sample_pdf, embed_signature_to_pdf
from web_app.src.core import config
from web_app.src.utils import get_hash_from_bytes, verify_signature


router = APIRouter(
    prefix="/api",
    tags=["API"]
)

# Временное хранилище документов
documents_store = {}


@router.post(path="/generate-pdf", summary="Генерация PDF документа")
async def generate_pdf():
    try:
        # Здесь ваша логика генерации PDF
        document_id = str(uuid.uuid4())

        # Создаем временный PDF файл (замените на вашу логику)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            create_sample_pdf(tmp_file.name)

            # Вычисляем хеш документа для подписания
            async with aiofiles.open(tmp_file.name, "rb") as f:
                content = await f.read()

            hash_file, hashed_data = get_hash_from_bytes(content)

            document_info = DocumentInfo(
                document_id=document_id,
                file_path=tmp_file.name,
                hash=hash_file,
                hashed_data=hashed_data
            )

            documents_store[document_id] = document_info

            return {
                "document_id": document_id,
                "file_url": f"/api/documents/{document_id}",
                "file_hash": hash_file,
                "message": "PDF generated successfully"
            }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}"
        )


@router.get(path="/documents/{document_id}", summary="Получение PDF документа")
async def get_document(document_id: str):
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")

    document_info = documents_store[document_id]
    return FileResponse(
        document_info.file_path,
        media_type='application/pdf',
        filename=f"document_{document_id}.pdf"
    )


@router.post(
    path="/documents/{document_id}/sign",
    summary="Прием и верификация подписанного документа"
)
async def sign_document(document_id: str, request: SignRequest):
    try:
        # 1. Валидация входных данных
        if document_id not in documents_store:
            raise HTTPException(status_code=404, detail="Document not found")


        if not request.signature:
            raise HTTPException(status_code=400, detail="Signature is required")

        # 2. Декодирование подписи
        try:
            signature_bytes = base64.b64decode(request.signature)

        except Exception as e:
            config.logger.error(f"Invalid signature format: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid signature format: {str(e)}")

        document_info = documents_store[document_id]

        # 3. Верификация подписи
        try:
            verification_result = verify_signature(
                hashed_data=document_info.hashed_data,
                signature=signature_bytes
            )

        except Exception as err:
            config.logger.warning(f"Signature verification failed for document {document_id}: {err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Signature verification failed for document"
            )

        # 4. Встраивание подписи в PDF
        """
        signed_pdf_path = await embed_signature_to_pdf(
            document_info.file_path,
            signature_bytes,
            request.certificate_algorithm,
            request.sign_type
        )

        # 5. Сохранение метаданных
        document_info.signed = True
        document_info.signature_type = request.sign_type
        document_info.signed_at = datetime.now()
        document_info.certificate_algorithm = request.certificate_algorithm
        document_info.signed_file_path = signed_pdf_path

        # 6. Аудит
        await audit_signature_operation(
            document_id=document_id,
            user_id="user_id_here",  # Получить из аутентификации
            operation="sign",
            success=True,
            metadata={
                "sign_type": request.sign_type,
                "algorithm": request.certificate_algorithm,
                "verification_result": verification_result
            }
        )
        """
        return {
            "status": "success",
            "message": f"Document signed successfully",
            "document_id": document_id,
            "signed_document_url": f"/api/documents/{document_id}/signed"
        }

    except HTTPException:
        raise

    except Exception as e:
        config.logger.error(f"Error signing document {document_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error signing document: {str(e)}"
        )


@router.get(
    path="/documents/{document_id}/signed",
    summary="Получение подписанного документа"
)
async def get_signed_document(document_id: str):
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")

    document_info = documents_store[document_id]
    return FileResponse(
        document_info.file_path,
        media_type='application/pdf',
        filename=f"signed_document_{document_id}.pdf"
    )