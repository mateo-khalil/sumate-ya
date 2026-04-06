FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --prefix backend --no-audit --no-fund
RUN npm ci --prefix frontend --no-audit --no-fund

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

EXPOSE 4000

CMD ["sh", "-c", "npm --prefix ../frontend run build && npm run build && npm run db:migrate && npm run db:seed && npm run start"]
