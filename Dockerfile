FROM node:20-alpine

WORKDIR /app

# Copy package files and install
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --production

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY .env ./.env

EXPOSE 3000

CMD ["node", "backend/server.js"]
