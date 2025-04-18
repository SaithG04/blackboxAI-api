# Imagen base más ligera con Node.js 20 (LTS)
FROM node:23-slim

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalamos primero las dependencias del sistema necesarias para Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copiamos package.json y package-lock.json primero para aprovechar el cache de Docker
COPY package*.json ./

# Instalamos dependencias
RUN npm install --production

# Copiamos todo el código fuente
COPY . .

# Configuración de variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Exponemos el puerto 3000
EXPOSE 3000

# Usamos un usuario no root por seguridad
USER node

# Comando por defecto para ejecutar la aplicación
CMD ["node", "src/app.js"]