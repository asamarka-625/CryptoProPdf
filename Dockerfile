FROM ubuntu:24.04

WORKDIR /app

# 1. Копируем файлы зависимостей
COPY linux-amd64_deb.tgz .

# Установка системных зависимостей
RUN apt update && \
    apt install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    gcc \
    g++ \
    libmagic1 \
    git \
    cmake \
    build-essential \
    libboost-all-dev \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. Устанавливаем CryptoPro
RUN tar xvf linux-amd64_deb.tgz

WORKDIR linux-amd64_deb

RUN ./install.sh && \
    apt install -y --no-install-recommends ./lsb-cprocsp-devel_5.0*.deb && \
    apt install -y --no-install-recommends ./cprocsp-pki-cades*.deb && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3. Копирование requirements и установка Python зависимостей
COPY requirements.txt .

# 4. Создаем виртуальное окружение и устанавливаем Python зависимости
RUN python3 -m venv venv && \
    venv/bin/pip install --upgrade pip && \
    venv/bin/pip install -r requirements.txt

# 5. Собираем pycades
RUN git clone https://github.com/CryptoPro/pycades.git

WORKDIR pycades

RUN mkdir build && \
    cd build && \
    cmake .. && \
    make -j4

WORKDIR /app

# 6. Копируем остальные файлы приложения
COPY . .

CMD ["venv/bin/uvicorn", "web_app:app", "--host", "0.0.0.0", "--port", "8000"]