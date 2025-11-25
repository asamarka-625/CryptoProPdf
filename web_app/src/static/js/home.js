// Глобальные переменные
const API_BASE = '/signature';

let currentDocumentId = null;
let currentDocumentHash = null;
let currentFileUrl = null;
let selectedCertificateIndex = null;
let certificates = [];
let cadespluginLoaded = false;

// Инициализация плагина
function initializePlugin() {
    const statusDiv = document.getElementById('pluginStatus');

    if (typeof cadesplugin === 'undefined') {
        statusDiv.innerHTML = '<div class="status error">КриптоПРО плагин не найден. Установите КриптоПРО Browser Plugin.</div>';
        return;
    }

    statusDiv.innerHTML = '<div class="status info">Инициализация плагина...</div>';

    cadesplugin.then(function() {
        cadespluginLoaded = true;
        statusDiv.innerHTML = '<div class="status success">Плагин успешно инициализирован!</div>';
        document.getElementById('loadCertsBtn').disabled = false;
        document.getElementById('generateBtn').disabled = false;
    }).catch(function(err) {
        statusDiv.innerHTML = `<div class="status error">Ошибка инициализации плагина: ${err.message}</div>`;
    });
}

// Загрузка сертификатов через CAPICOM.Store (как в статье)
function loadCertificates() {
    if (!cadespluginLoaded) {
        alert('Сначала инициализируйте плагин');
        return;
    }

    const statusDiv = document.getElementById('certStatus');
    const listDiv = document.getElementById('certificatesList');

    statusDiv.innerHTML = '<div class="status info">Загрузка сертификатов...</div>';
    listDiv.innerHTML = '';

    cadesplugin.async_spawn(function*() {
        try {
            let oStore = yield cadesplugin.CreateObjectAsync("CAPICOM.Store");

            // Открываем хранилище сертификатов
            yield oStore.Open(
                cadesplugin.CAPICOM_CURRENT_USER_STORE,
                cadesplugin.CAPICOM_MY_STORE,
                cadesplugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED
            );

            // Получаем сертификаты
            let certs = yield oStore.Certificates;
            certs = yield certs.Find(cadesplugin.CAPICOM_CERTIFICATE_FIND_TIME_VALID);
            let certsCount = yield certs.Count;

            certificates = [];

            if (certsCount === 0) {
                statusDiv.innerHTML = '<div class="status warning">Сертификаты не найдены</div>';
                return;
            }

            statusDiv.innerHTML = `<div class="status info">Найдено сертификатов: ${certsCount}</div>`;

            // Загружаем информацию о каждом сертификате
            for (let i = 1; i <= certsCount; i++) {
                try {
                    let cert = yield certs.Item(i);
                    let subjectName = yield cert.SubjectName;
                    let issuerName = yield cert.IssuerName;
                    let validFrom = yield cert.ValidFromDate;
                    let validTo = yield cert.ValidToDate;
                    let hasPrivateKey = yield cert.HasPrivateKey();

                    let certInfo = {
                        certificate: cert,
                        subjectName: subjectName,
                        issuerName: issuerName,
                        validFrom: new Date(validFrom),
                        validTo: new Date(validTo),
                        hasPrivateKey: hasPrivateKey,
                        index: i - 1
                    };

                    certificates.push(certInfo);

                    // Создаем элемент для отображения сертификата
                    const certElement = document.createElement('div');
                    certElement.className = 'cert-item';
                    certElement.innerHTML = `
                        <strong>Сертификат ${i}</strong><br>
                        <strong>Владелец:</strong> ${subjectName}<br>
                        <strong>Издатель:</strong> ${issuerName}<br>
                        <strong>Действует с:</strong> ${new Date(validFrom).toLocaleDateString()}<br>
                        <strong>Действует по:</strong> ${new Date(validTo).toLocaleDateString()}<br>
                        <strong>Приватный ключ:</strong> ${hasPrivateKey ? '✅ Доступен' : '❌ Недоступен'}
                        <br><br>
                        ${hasPrivateKey ?
                            `<button onclick="selectCertificate(${i - 1})" style="background: #28a745;">Выбрать для подписания</button>` :
                            `<button disabled>Ключ недоступен</button>`
                        }
                    `;

                    listDiv.appendChild(certElement);

                } catch (certError) {
                    console.error(`Ошибка загрузки сертификата ${i}:`, certError);
                }
            }

            statusDiv.innerHTML = `<div class="status success">Успешно загружено ${certificates.length} сертификатов</div>`;
            oStore.Close();

        } catch (exc) {
            console.error('Ошибка загрузки сертификатов:', exc);
            statusDiv.innerHTML = `<div class="status error">Ошибка загрузки сертификатов: ${exc.message}</div>`;
        }
    });
}

// Выбор сертификата
function selectCertificate(index) {
    selectedCertificateIndex = index;
    const certItems = document.querySelectorAll('.cert-item');
    certItems.forEach(item => item.classList.remove('selected'));
    certItems[index].classList.add('selected');

    const certInfo = certificates[index];
    document.getElementById('certStatus').innerHTML =
        `<div class="status success">Выбран сертификат: ${certInfo.subjectName}</div>`;
}

// Генерация PDF
async function generatePDF() {
    const statusDiv = document.getElementById('generateStatus');
    try {
        statusDiv.innerHTML = '<div class="status info">Генерация документа...</div>';

        const response = await fetch(`${API_BASE}/api/generate-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка генерации документа');
        }

        const data = await response.json();
        currentDocumentId = data.document_id;
        currentDocumentHash = data.file_hash;
        currentFileUrl = `/signature${data.file_url}`;
        statusDiv.innerHTML = `<div class="status success">
            Документ создан! ID: ${data.document_id}
        </div>`;

        // Активируем кнопку подписания если выбран сертификат
        if (selectedCertificateIndex !== null) {
            document.getElementById('signBtn').disabled = false;
        }

    } catch (error) {
        statusDiv.innerHTML = `<div class="status error">Ошибка: ${error.message}</div>`;
    }
}

// Подписание PDF (обновленная версия по примеру из статьи)
function signPDF() {
    if (selectedCertificateIndex === null || !currentDocumentId) {
        alert('Сначала выберите сертификат и сгенерируйте документ');
        return;
    }

    const statusDiv = document.getElementById('signStatus');
    statusDiv.innerHTML = '<div class="status info">Начало процесса подписания...</div>';

    cadesplugin.async_spawn(function*() {
        try {
            console.log("File", currentFileUrl);

            let cert = certificates[selectedCertificateIndex].certificate;

            // Получаем информацию о сертификате для диагностики
            let certSubject = yield cert.SubjectName;
            let certThumbprint = yield cert.Thumbprint;
            console.log('Подписание сертификатом:', certSubject);

            console.log("create oHashedData");
            var oHashedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.HashedData");

            // Инициализируем объект заранее вычисленным хэш-значением
            yield oHashedData.propset_Algorithm(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256);;
            yield oHashedData.SetHashValue(currentDocumentHash);
            console.log("oHashedData", oHashedData);

            var oSigner = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSigner");
            yield oSigner.propset_Certificate(cert);
            yield oSigner.propset_CheckCertificate(true);

            var oSignedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
            var sSignedMessage = yield oSignedData.SignHash(oHashedData, oSigner, cadesplugin.CADESCOM_CADES_BES);
            console.log("sSignedMessage", sSignedMessage);


            // Создаем объект CAdESCOM.CadesSignedData
            var oSignedData2 = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");

            // Проверяем подпись
            try {
                yield oSignedData2.VerifyHash(oHashedData, sSignedMessage, cadesplugin.CADESCOM_CADES_BES);
                alert("Signature verified");
            } catch (err) {
                alert("Failed to verify signature. Error: " + cadesplugin.getLastError(err));
                return;
            }

            downloadSignatureBase64(sSignedMessage, `signed_${currentDocumentId}`);

            /*
            var fileData = yield loadFileFromUrl(currentFileUrl);
            console.log("fileData", fileData);
            var fileName = getFileNameFromUrl(currentFileUrl);

            var oSigner = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSigner");
            yield oSigner.propset_Certificate(cert);
            yield oSigner.propset_CheckCertificate(true);

            var oSignature = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSignature");

            // Настраиваем параметры визуальной подписи
            yield oSignature.propset_Reason("Документ подписан электронной подписью");
            yield oSignature.propset_Location("Москва");
            yield oSignature.propset_ContactInfo("email@example.com");

            // Привязываем визуальное представление к подписанту
            yield oSigner.propset_Signature(oSignature);

            var oSignedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
            yield oSignedData.propset_ContentEncoding(cadesplugin.CADESCOM_BASE64_TO_BINARY);
            yield oSignedData.propset_Content(fileData);

            var sSignedMessage;
            try {
                sSignedMessage = yield oSignedData.SignCades(
                    oSigner,
                    cadesplugin.CADESCOM_CADES_BES,
                    false
                );
            } catch (err) {
                alert("Failed to create signature. Error: " + cadesplugin.getLastError(err));
                return;
            }

            var oSignedData2 = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
            try {
                yield oSignedData2.propset_ContentEncoding(cadesplugin.CADESCOM_BASE64_TO_BINARY);
                yield oSignedData2.propset_Content(fileData);
                yield oSignedData2.VerifyCades(
                    sSignedMessage,
                    cadesplugin.CADESCOM_CADES_BES,
                    false
                );
                alert("Signature verified successfully for file: " + fileName);
            } catch (err) {
                alert("Failed to verify signature. Error: " + cadesplugin.getLastError(err));
                return;
            }

            // Скачиваем файл
            downloadSignedPdf(sSignedMessage, fileName);
            */

            // Отправляем подпись на сервер для верификации и сохранения
            statusDiv.innerHTML += '<div class="status info">Отправка подписи на сервер...</div>';

            try {
                const response = yield fetch(`${API_BASE}/api/documents/${currentDocumentId}/sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    document_id: currentDocumentId,
                    signature: sSignedMessage
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const signResponse = yield response.json();

            if (signResponse) {
                console.log('Подпись успешно сохранена на сервере');

            } else {
                console.warn('Сервер вернул ошибку:', signResponse?.message);
            }

            } catch (serverError) {
                console.warn('Не удалось отправить подпись на сервер:', serverError);
                // Не прерываем выполнение, т.к. подпись уже скачана
            }

        } catch (exc) {
            console.error('Ошибка', exc);
        }
    });
}

// Функция для загрузки файла по URL
function loadFileFromUrl(url) {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onload = function() {
            if (xhr.status === 200) {
                var blob = xhr.response;
                var reader = new FileReader();

                reader.onload = function() {
                    var base64 = reader.result.split(',')[1];
                    resolve(base64);
                };

                reader.onerror = function() {
                    reject(new Error('Failed to read blob as base64'));
                };

                reader.readAsDataURL(blob);
            } else {
                reject(new Error('Failed to load file: ' + xhr.statusText));
            }
        };

        xhr.onerror = function() {
            reject(new Error('Network error while loading file'));
        };

        xhr.send();
    });
}

function downloadSignedPdf(pdfData, fileName) {
    // Добавляем префикс для имени файла
    var signedFileName = "signed_" + fileName;

    // Создаем blob из base64 данных
    var binaryString = atob(pdfData);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    var blob = new Blob([bytes], { type: 'application/pdf' });

    // Создаем ссылку для скачивания
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = signedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert("PDF с подписью успешно создан и скачан: " + signedFileName);
}

// Функция для извлечения имени файла из URL
function getFileNameFromUrl(url) {
    return url.substring(url.lastIndexOf('/') + 1);
}

// Функция для скачивания подписи в base64
function downloadSignatureBase64(signatureData, fileName) {
    try {
        // Подпись от CAdESCOM обычно возвращается в base64 формате
        // Проверяем, является ли строка валидным base64
        let data = signatureData;

        // Если данные не в base64 (нет типичных признаков), конвертируем
        if (typeof signatureData === 'string' &&
            !signatureData.startsWith('MI') &&
            !signatureData.match(/^[A-Za-z0-9+/=]+$/)) {
            // Конвертируем в base64
            data = btoa(unescape(encodeURIComponent(signatureData)));
        }

        // Декодируем base64 обратно в бинарные данные для Blob
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Создаем Blob с правильным MIME type для подписи
        const blob = new Blob([bytes], { type: 'application/octet-stream' });

        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.endsWith('.sig') ? fileName : fileName + '.sig';
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();

        // Очищаем ресурсы
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);

        console.log("Signature file downloaded successfully: " + fileName);

    } catch (error) {
        console.error("Error downloading signature file:", error);
        alert("Error saving signature file: " + error.message);
    }
}

// Автоматическая инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    if (typeof cadesplugin !== 'undefined') {
        initializePlugin();
    } else {
        document.getElementById('pluginStatus').innerHTML =
            '<div class="status error">КриптоПРО плагин не загружен. Проверьте подключение скрипта.</div>';
    }
});