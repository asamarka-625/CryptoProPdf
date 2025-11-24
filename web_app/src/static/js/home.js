// Глобальные переменные
let currentDocumentId = null;
let currentDocumentHash = null;
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

        const response = await fetch('/api/generate-pdf', {
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

function InitializeHashedData(hashAlg, sHashValue) {
    // Создаем объект CAdESCOM.HashedData
    var oHashedData = cadesplugin.CreateObject("CAdESCOM.HashedData");

    // Инициализируем объект заранее вычисленным хэш-значением
    // Алгоритм хэширования нужно указать до того, как будет передано хэш-значение
    oHashedData.Algorithm = hashAlg;
    oHashedData.SetHashValue(sHashValue);

    return oHashedData;
}

function CreateSignature(oCertificate, oHashedData) {
    // Создаем объект CAdESCOM.CPSigner
    var oSigner = cadesplugin.CreateObject("CAdESCOM.CPSigner");
    oSigner.Certificate = oCertificate;
    oSigner.CheckCertificate = false;

    // Создаем объект CAdESCOM.CadesSignedData
    var oSignedData = cadesplugin.CreateObject("CAdESCOM.CadesSignedData");

    var sSignedMessage = "";

    // Вычисляем значение подписи
    try {
        sSignedMessage = oSignedData.SignHash(oHashedData, oSigner, cadesplugin.CADESCOM_CADES_BES);
    } catch (err) {
        alert("Failed to create signature. Error: " + cadesplugin.getLastError(err));
        return;
    }

    return sSignedMessage;
}

// Подписание PDF (обновленная версия по примеру из статьи)
async function signPDF() {
    if (selectedCertificateIndex === null || !currentDocumentId) {
        alert('Сначала выберите сертификат и сгенерируйте документ');
        return;
    }

    const statusDiv = document.getElementById('signStatus');
    statusDiv.innerHTML = '<div class="status info">Начало процесса подписания...</div>';

    let cert = certificates[selectedCertificateIndex].certificate;

    // Получаем информацию о сертификате для диагностики
    let certSubject = yield cert.SubjectName;
    let certThumbprint = yield cert.Thumbprint;
    console.log('Подписание сертификатом:', certSubject);

    let oHashedData = InitializeHashedData(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256, currentDocumentHash);

    let signature = CreateSignature(cert, oHashedData);

    // Скачиваем .sig файл
    const fileName = `document_${currentDocumentId}_${Date.now()}.sig`;
    const downloadSuccess = downloadSigFile(signature, fileName);

    // Отправляем подпись на сервер для верификации и сохранения
    statusDiv.innerHTML += '<div class="status info">Отправка подписи на сервер...</div>';

    try {
        const signResponse = yield new Promise((resolve, reject) => {
            fetch(`/api/documents/${currentDocumentId}/sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    document_id: currentDocumentId,
                    signature: signature
                })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => resolve(data))
            .catch(error => reject(error));
        });

        if (signResponse && signResponse.success) {
            console.log('Подпись успешно сохранена на сервере');
            if (document.getElementById('downloadBtn')) {
                document.getElementById('downloadBtn').disabled = false;
            }
        } else {
            console.warn('Сервер вернул ошибку:', signResponse?.message);
        }

    } catch (serverError) {
        console.warn('Не удалось отправить подпись на сервер:', serverError);
        // Не прерываем выполнение, т.к. подпись уже скачана
    }
}

// Скачивание подписанного PDF
function downloadSignedPDF() {
    if (!currentDocumentId) return;
    window.open(`/api/documents/${currentDocumentId}/signed`, '_blank');
}

function downloadSigFile(signatureData, fileName = 'signature.sig') {
    try {
        // Если подпись в base64, декодируем в бинарный формат
        let binarySignature;

        if (typeof signatureData === 'string' && signatureData.includes('base64')) {
            // Извлекаем base64 данные если есть префикс
            const base64Data = signatureData.split('base64,')[1] || signatureData;
            binarySignature = base64ToArrayBuffer(base64Data);
        } else if (typeof signatureData === 'string') {
            // Предполагаем что это чистый base64
            binarySignature = base64ToArrayBuffer(signatureData);
        } else {
            // Уже бинарные данные
            binarySignature = signatureData;
        }

        // Создаем Blob с правильным MIME-type для подписи
        const blob = new Blob([binarySignature], {
            type: 'application/octet-stream'
        });

        // Создаем URL для скачивания
        const url = window.URL.createObjectURL(blob);

        // Создаем временную ссылку для скачивания
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.endsWith('.sig') ? fileName : `${fileName}.sig`;

        // Добавляем в DOM, кликаем и удаляем
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Освобождаем память
        window.URL.revokeObjectURL(url);

        console.log('Файл подписи успешно скачан:', fileName);
        return true;

    } catch (error) {
        console.error('Ошибка при скачивании подписи:', error);
        return false;
    }
}

/**
 * Конвертация base64 в ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Конвертация ArrayBuffer в base64
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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