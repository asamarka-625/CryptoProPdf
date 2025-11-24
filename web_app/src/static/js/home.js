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
            statusDiv.innerHTML = '<div class="status info">Подготовка к подписанию...</div>';

            let cert = certificates[selectedCertificateIndex].certificate;

            // Получаем информацию о сертификате для диагностики
            let certSubject = yield cert.SubjectName;
            let certThumbprint = yield cert.Thumbprint;
            console.log('Подписание сертификатом:', certSubject);

            // Проверяем наличие закрытого ключа
            try {
                let hasPrivateKey = yield cert.HasPrivateKey();
                if (!hasPrivateKey) {
                    throw new Error('Нет доступа к закрытому ключу сертификата');
                }
            } catch (e) {
                console.warn('Не удалось проверить закрытый ключ:', e.message);
            }

            // Создаем подписанта с правильными настройками
            let oSigner = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSigner");
            yield oSigner.propset_Certificate(cert);

            // ВКЛЮЧАЕМ проверку сертификата для валидной подписи
            yield oSigner.propset_CheckCertificate(false);

            // Используем правильные опции
            yield oSigner.propset_Options(cadesplugin.CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN);

            // Добавляем время подписания
            yield oSigner.propset_SigningTime(new Date());

            // Опционально: служба штампов времени
            try {
                yield oSigner.propset_TSAAddress("http://cryptopro.ru/tsp/");
            } catch (e) {
                console.log('Служба штампов времени недоступна:', e.message);
            }

            statusDiv.innerHTML = '<div class="status info">Создание подписи...</div>';

            let oSignedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
            yield oSignedData.propset_ContentEncoding(cadesplugin.CADESCOM_BASE64_TO_BINARY);

            // Устанавливаем содержимое для подписи
            yield oSignedData.propset_Content(currentDocumentHash);

            let signature;
            let signatureType = '';

            // Пробуем разные типы подписи в порядке надежности
            try {
                // МЕТОД 1: CAdES-X Long Type 1 (самый надежный)
                signature = yield oSignedData.SignCades(
                    oSigner,
                    cadesplugin.CADESCOM_CADES_X_LONG_TYPE_1
                );
                signatureType = 'CAdES-X Long Type 1';
                console.log('Подпись создана: CAdES-X Long Type 1');

            } catch (e1) {
                console.log('CAdES-X Long не сработал, пробуем CAdES-BES:', e1.message);

                try {
                    // МЕТОД 2: CAdES-BES
                    signature = yield oSignedData.SignCades(
                        oSigner,
                        cadesplugin.CADESCOM_CADES_BES
                    );
                    signatureType = 'CAdES-BES';
                    console.log('Подпись создана: CAdES-BES');

                } catch (e2) {
                    console.log('CAdES-BES не сработал, пробуем базовую подпись:', e2.message);

                    try {
                        // МЕТОД 3: Базовая подпись
                        signature = yield oSignedData.SignCades(
                            oSigner,
                            cadesplugin.CADESCOM_CADES_DEFAULT
                        );
                        signatureType = 'CAdES Default';
                        console.log('Подпись создана: CAdES Default');

                    } catch (e3) {
                        console.log('Все методы CAdES не сработали, пробуем SignHash:', e3.message);

                        // МЕТОД 4: SignHash как запасной вариант
                        let oHashedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.HashedData");

                        // Определяем алгоритм хеширования
                        try {
                            let certPublicKey = yield cert.PublicKey();
                            let certAlgorithm = yield certPublicKey.Algorithm;
                            let algorithmValue = yield certAlgorithm.Value;

                            if (algorithmValue === "1.2.643.7.1.1.1.1") {
                                yield oHashedData.propset_Algorithm(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256);
                            } else {
                                yield oHashedData.propset_Algorithm(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411);
                            }
                        } catch (algError) {
                            // Используем GOST 2012 по умолчанию
                            yield oHashedData.propset_Algorithm(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256);
                        }

                        yield oHashedData.SetHashValue(currentDocumentHash);

                        signature = yield oSignedData.SignHash(
                            oHashedData,
                            oSigner,
                            cadesplugin.CADESCOM_CADES_BES
                        );
                        signatureType = 'SignHash';
                        console.log('Подпись создана: SignHash');
                    }
                }
            }

            if (!signature) {
                throw new Error('Не удалось создать подпись ни одним из методов');
            }

            // Скачиваем .sig файл
            const fileName = `document_${currentDocumentId}_${Date.now()}.sig`;
            const downloadSuccess = downloadSigFile(signature, fileName);

            if (downloadSuccess) {
                statusDiv.innerHTML = `
                    <div class="status success">
                        ✅ Подпись успешно создана и скачана!
                        <br><small>Тип подписи: ${signatureType}</small>
                        <br><small>Сертификат: ${certSubject}</small>
                        <br><small>Файл: ${fileName}</small>
                    </div>
                `;

                // Сохраняем подпись для возможного повторного скачивания
                window.lastSignature = signature;
                window.lastSignatureType = signatureType;

            } else {
                throw new Error('Не удалось скачать файл подписи');
            }

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
                            }
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

        } catch (exc) {
            console.error('Ошибка подписания:', exc);

            let errorMessage = `Ошибка подписания: ${exc.message}`;

            // Расшифровка распространенных ошибок
            if (exc.message.includes('0x800B0109') || exc.message.includes('цепочка')) {
                errorMessage += '<br><br><strong>Решение проблемы с цепочкой доверия:</strong>';
                errorMessage += '<br>• Установите корневой сертификат УЦ в "Доверенные корневые центры сертификации"';
                errorMessage += '<br>• Проверьте срок действия сертификатов в цепочке';
                errorMessage += '<br>• Убедитесь, что все промежуточные сертификаты установлены';
            } else if (exc.message.includes('0x80090008')) {
                errorMessage += '<br><br><strong>Проблема с закрытым ключом:</strong>';
                errorMessage += '<br>• Убедитесь, что токен/смарт-карта подключены';
                errorMessage += '<br>• Проверьте пин-код';
                errorMessage += '<br>• Переустановите драйверы токена';
            } else if (exc.message.includes('0x80091004')) {
                errorMessage += '<br><br><strong>Недопустимый тип криптографического сообщения:</strong>';
                errorMessage += '<br>• Проверьте настройки КриптоПРО';
                errorMessage += '<br>• Попробуйте другой тип подписи';
            }

            statusDiv.innerHTML = `<div class="status error">${errorMessage}</div>`;
        }
    });
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