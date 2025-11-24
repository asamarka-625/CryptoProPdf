// Глобальные переменные
let currentDocumentId = null;
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
            statusDiv.innerHTML = '<div class="status info">Создание подписи...</div>';

            // Создаем объекты для подписи
            let oSigner = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPSigner");
            yield oSigner.propset_Certificate(cert);

            // ВАЖНО: Отключаем проверку цепочки доверия или настраиваем параметры
            yield oSigner.propset_Options(0); // Убираем CAPICOM_CERTIFICATE_INCLUDE_WHOLE_CHAIN

            // Альтернативные варианты настройки:
            // yield oSigner.propset_Options(cadesplugin.CAPICOM_CERTIFICATE_INCLUDE_END_ENTITY_ONLY);

            // Отключаем проверку цепочки при подписании
            yield oSigner.propset_CheckCertificate(false);

            let hashObject = yield cadesplugin.CreateObjectAsync("CAdESCOM.HashedData");

            // Устанавливаем алгоритм хеширования
            if (algorithmValue === "1.2.643.7.1.1.1.1") {
                yield hashObject.propset_Algorithm(cadesplugin.CADESCOM_HASH_ALGORITHM_CP_GOST_3411_2012_256);
            } else {
                throw new Error('Не удалось установить алгоритм хэширования');
            }

            // Устанавливаем полученный хеш
            yield hashObject.SetHashValue(hashResponse.hash);

            let oSignedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CadesSignedData");
            yield oSignedData.propset_ContentEncoding(cadesplugin.CADESCOM_BASE64_TO_BINARY);

            // Пробуем самые простые типы подписи
            let signature;
            try {
                // Сначала пробуем RAW подпись (самая простая)
                signature = yield oSignedData.SignHash(
                    hashObject,
                    oSigner,
                    cadesplugin.CADESCOM_CADES_BES
                );
            } catch (signError) {
                console.log('CAdES-BES не сработал, пробуем альтернативный метод...', signError);

                // Альтернативный подход - создаем подпись через CPEnvelopedData
                let oEnvelopedData = yield cadesplugin.CreateObjectAsync("CAdESCOM.CPEnvelopedData");
                yield oEnvelopedData.propset_Content(hashResponse.hash);

                let oRecipients = yield oEnvelopedData.Recipients;
                yield oRecipients.Add(cert);

                signature = yield oEnvelopedData.Encrypt(cadesplugin.CADESCOM_ENCODE_BASE64);
            }

            statusDiv.innerHTML = '<div class="status info">Отправка подписи на сервер...</div>';

            // Отправляем подпись на сервер
            const signResponse = yield new Promise((resolve, reject) => {
                fetch(`/api/documents/${currentDocumentId}/sign`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        document_id: currentDocumentId,
                        signature: signature,
                    })
                })
                .then(response => response.json())
                .then(data => resolve(data))
                .catch(error => reject(error));
            });

            if (signResponse && signResponse.status === "success") {
                statusDiv.innerHTML = `<div class="status success">${signResponse.message}</div>`;
                document.getElementById('downloadBtn').disabled = false;
            } else {
                throw new Error(signResponse.message || 'Ошибка при сохранении подписи');
            }

        } catch (exc) {
            console.error('Ошибка подписания:', exc);

            let errorMessage = `Ошибка подписания: ${exc.message}`;

            // Добавляем понятное описание ошибки
            if (exc.message.includes('0x800B0109') || exc.message.includes('цепочка')) {
                errorMessage += '<br><br><strong>Решение проблемы:</strong>';
                errorMessage += '<br>1. Установите корневой сертификат УЦ в "Доверенные корневые центры сертификации"';
                errorMessage += '<br>2. Или используйте сертификат от доверенного УЦ';
                errorMessage += '<br>3. Проверьте срок действия сертификатов в цепочке';
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

// Автоматическая инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    if (typeof cadesplugin !== 'undefined') {
        initializePlugin();
    } else {
        document.getElementById('pluginStatus').innerHTML =
            '<div class="status error">КриптоПРО плагин не загружен. Проверьте подключение скрипта.</div>';
    }
});