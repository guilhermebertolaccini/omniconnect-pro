# Build from monorepo root so `file:../../../../../packages/shared-types` resolves
# (same paths as in package.json).
#
#   docker build -f apps/botify/wordpress-plugin/botflow-manager/microservice/Dockerfile .
#
FROM node:20-alpine AS builder

WORKDIR /repo

# --- shared-types (standalone npm; tsconfig extends ../tsconfig/base.json)
COPY packages/tsconfig/base.json packages/tsconfig/base.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-types/tsconfig.json packages/shared-types/tsconfig.json
COPY packages/shared-types/src packages/shared-types/src

WORKDIR /repo/packages/shared-types
RUN npm install && npm run build

# --- microservice
WORKDIR /repo/apps/botify/wordpress-plugin/botflow-manager/microservice
COPY apps/botify/wordpress-plugin/botflow-manager/microservice/package.json \
  apps/botify/wordpress-plugin/botflow-manager/microservice/package-lock.json \
  apps/botify/wordpress-plugin/botflow-manager/microservice/tsconfig.json ./
RUN npm ci

COPY apps/botify/wordpress-plugin/botflow-manager/microservice/src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app
COPY --from=builder \
  /repo/apps/botify/wordpress-plugin/botflow-manager/microservice/package.json \
  /repo/apps/botify/wordpress-plugin/botflow-manager/microservice/package-lock.json \
  ./

RUN npm ci --omit=dev

COPY --from=builder /repo/apps/botify/wordpress-plugin/botflow-manager/microservice/dist ./dist

RUN mkdir -p logs

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health/live || exit 1

CMD ["node", "dist/index.js"]
