FROM node:20
WORKDIR /app

# Copia manifestos
COPY package*.json ./

# Instala dependências de produção
RUN npm install --only=production

# Copia código e estáticos
COPY backend ./backend
COPY frontend ./frontend

# Prepara diretórios
RUN mkdir -p backend/data/uploads

EXPOSE 3000
CMD ["node", "backend/server.js"]
