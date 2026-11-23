# syntax=docker/dockerfile:1

FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tests/fixtures ./tests/fixtures
COPY config ./config
COPY start.sh ./start.sh

RUN mkdir -p /app/data/inbox /app/data/archive /app/data/quarantine \
  && chmod +x /app/start.sh

EXPOSE 4000

CMD ["./start.sh"]
