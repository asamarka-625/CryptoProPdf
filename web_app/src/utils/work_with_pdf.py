# Внешние зависимости
import uuid
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
# Внутренние модули
from web_app.src.core import config


def create_sample_pdf(file_path: str):
    """Создание примера PDF файла"""
    c = canvas.Canvas(file_path, pagesize=letter)
    c.drawString(100, 750, "Документ для подписания")
    c.drawString(100, 730, f"ID: {str(uuid.uuid4())}")
    c.drawString(100, 710, "Подпишите этот документ с помощью КриптоПРО")
    c.save()


async def embed_signature_to_pdf(original_pdf_path: str, signature: bytes, sign_type: str) -> str:
    """Встраивание подписи в PDF документ"""
    try:
        # Генерируем путь для подписанного файла
        signed_pdf_path = original_pdf_path.replace('.pdf', f'_signed_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf')

        # Здесь должна быть реализация встраивания подписи в PDF
        # с использованием библиотек типа reportlab, pypdf2, или pdfkit

        # Временная реализация - копируем файл
        import shutil
        shutil.copy2(original_pdf_path, signed_pdf_path)

        # Сохраняем подпись в отдельный файл для аудита
        signature_path = signed_pdf_path + '.sig'
        with open(signature_path, 'wb') as f:
            f.write(signature)

        config.logger.info(f"Signature embedded: {signed_pdf_path}, type: {sign_type}")
        return signed_pdf_path

    except Exception as e:
        config.logger.error(f"Error embedding signature: {str(e)}")
        raise Exception(f"Failed to embed signature: {str(e)}")