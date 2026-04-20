FROM node:24-alpine AS deps
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm i --frozen-lockfile

# --- Dev stage: has source + full node_modules ---
FROM node:24-alpine AS dev
WORKDIR /app

RUN corepack enable pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3001

CMD ["pnpm", "run", "dev"]

# --- Builder: produces standalone output ---
FROM dev AS builder

RUN pnpm run build

# --- Prod stage: minimal standalone server ---
FROM node:24-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
