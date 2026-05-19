# syntax=docker/dockerfile:1.7
# api-gateway runtime — no ffmpeg needed.

FROM node:20-alpine AS builder
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN --mount=type=cache,target=/root/.pnpm-store pnpm install --frozen-lockfile
RUN pnpm -r build
RUN pnpm deploy --filter @clipdirector/api-gateway --prod /deploy

FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /deploy ./
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
