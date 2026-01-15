# ---------- stage 1: build frontend ----------
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app

# deps for frontend
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci

# copy sources
COPY frontend/ ./


WORKDIR /app
COPY backend/ ./backend/

WORKDIR /app/frontend
RUN npm run build


# ---------- stage 2: build backend ----------
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./

# Prisma generate
RUN npx prisma generate

# build NestJS (dist/)
RUN npm run build


# ---------- stage 3: runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production


# COpy
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package*.json ./

# Prisma artifacts
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/prisma.config.ts ./prisma.config.ts

# Frontend static
COPY --from=frontend-build /app/backend/public ./public
RUN chmod -R a+rX ./public && chmod -R a+rX ./dist
EXPOSE 3001

CMD sh -c "npx prisma migrate deploy && node dist/src/main.js"
