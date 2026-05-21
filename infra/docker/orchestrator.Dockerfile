# syntax=docker/dockerfile:1.7
# orchestrator runtime — needs ffmpeg + ffprobe for frame sampling.

FROM node:20 AS builder
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN --mount=type=cache,target=/root/.pnpm-store pnpm install --frozen-lockfile
RUN pnpm -r build
RUN pnpm deploy --filter @clipdirector/orchestrator --prod /deploy

FROM ubuntu:24.04 AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg tini \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1000 clipdirector \
 && useradd --system --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin clipdirector
WORKDIR /app
COPY --from=builder --chown=clipdirector:clipdirector /deploy ./
USER clipdirector
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
