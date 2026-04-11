FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN pnpm install --frozen-lockfile

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app

EXPOSE 4000

CMD ["sh", "-c", "pnpm --filter @sumate-ya/frontend build && pnpm --filter @sumate-ya/backend build && pnpm --filter @sumate-ya/backend db:migrate && pnpm --filter @sumate-ya/backend db:seed && pnpm --filter @sumate-ya/backend start"]
