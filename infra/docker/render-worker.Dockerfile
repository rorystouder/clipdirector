# syntax=docker/dockerfile:1.7
# render-worker runtime — needs ffmpeg, ffprobe, and a font for drawtext.

FROM node:20 AS builder
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN --mount=type=cache,target=/root/.pnpm-store pnpm install --frozen-lockfile
RUN pnpm -r build
RUN pnpm deploy --filter @clipdirector/render-worker --prod /deploy

FROM ubuntu:24.04 AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg tini fonts-dejavu-core \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1000 clipdirector \
 && useradd --system --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin clipdirector
WORKDIR /app
COPY --from=builder --chown=clipdirector:clipdirector /deploy ./
# RENDER_TEMP_DIR exists at /tmp/clipdirector (bind-mounted in compose).
# Pre-create + chown so the worker can write trim/concat intermediates.
RUN mkdir -p /tmp/clipdirector && chown -R clipdirector:clipdirector /tmp/clipdirector
USER clipdirector
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    RENDER_TEMP_DIR=/tmp/clipdirector \
    MUSIC_LIBRARY_PATH=/opt/clipdirector/music \
    FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
