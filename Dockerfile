# Imagen base
FROM node:23-slim

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos package.json y package-lock.json
COPY package*.json ./

# Instalamos las dependencias de Node.js
RUN npm install

# Instalamos las dependencias de sistema necesarias para Chromium (pero no Firefox ni Webkit)
RUN apt-get update && apt-get install -y wget ca-certificates fonts-liberation libappindicator3-1 libasound2 \
    libatk-bridge2.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 xdg-utils

# Instalamos SOLO Chromium para Playwright
RUN npx playwright install chromium

# Copiamos todo el código fuente
COPY . .

# Exponemos el puerto 3000
EXPOSE 3000

# Comando por defecto para ejecutar la aplicación
CMD ["node", "src/app.js"]