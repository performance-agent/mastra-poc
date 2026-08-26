# ---------- Build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy core first because backend depends on local @pa/* packages
COPY core ./core

# Build core packages
WORKDIR /app/core
RUN npm ci
RUN npm run build

# Build agent package because backend depends on local @pa/agent
WORKDIR /app/agent
COPY agent/package*.json ./
RUN npm ci

COPY agent/tsconfig.json ./
COPY agent/src ./src
RUN npm run build
# The backend's file dependency resolves to /app/agent at runtime, so keep the
# agent's own production dependencies available for Node's module resolution.
RUN npm prune --omit=dev

# Install and build backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

COPY backend ./

RUN npx prisma generate
RUN npm run build

# Remove dev dependencies for production image
RUN npm prune --omit=dev


# ---------- Production stage ----------
FROM node:22-alpine AS production

WORKDIR /app/backend

ENV NODE_ENV=production

COPY --from=builder /app/core /app/core
COPY --from=builder /app/agent/package.json /app/agent/package.json
COPY --from=builder /app/agent/dist /app/agent/dist
COPY --from=builder /app/agent/node_modules /app/agent/node_modules
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/generated ./generated
COPY --from=builder /app/backend/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
