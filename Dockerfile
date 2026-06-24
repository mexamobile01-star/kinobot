FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ===== Production =====
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY start.sh ./start.sh
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist

RUN chmod +x start.sh

CMD ["sh", "start.sh"]
