# ===== Stage 1: Dependencies =====
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# ===== Stage 2: Build =====
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

RUN pnpm --filter @nexus/shared build && \
    pnpm --filter @nexus/api build

RUN pnpm prune --prod

# ===== Stage 3: Runtime =====
FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -S nexus && adduser -S nexus -G nexus

COPY --from=builder --chown=nexus:nexus /app/node_modules ./node_modules
# pnpm não hoista: as deps do apps/api vivem em apps/api/node_modules (symlinks
# para o store em /app/node_modules/.pnpm). Sem isto, dist/main.js não resolve
# @nestjs/core em runtime (MODULE_NOT_FOUND → crash loop).
COPY --from=builder --chown=nexus:nexus /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nexus:nexus /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nexus:nexus /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=nexus:nexus /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nexus:nexus /app/apps/api/package.json ./apps/api/
# Drizzle migrations are applied at boot by main.ts (drizzle-kit is dev-only and
# pruned from this image, so the SQL files must travel with it).
COPY --from=builder --chown=nexus:nexus /app/apps/api/drizzle ./apps/api/drizzle

RUN mkdir -p /secrets && chown nexus:nexus /secrets

USER nexus

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:4000/health/liveness || exit 1

CMD ["node", "apps/api/dist/main.js"]
