FROM docker.io/library/node:22-bookworm-slim AS web
RUN npm install -g pnpm@11.28.5 --no-fund --no-audit
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/src ./src
COPY web/patch-board.mjs ./
RUN pnpm run build

FROM docker.io/library/rust:1.99.1-alpine3.23 AS server
RUN apk add --no-cache musl-dev build-base
WORKDIR /src
COPY server/Cargo.toml server/Cargo.lock ./
# dependencies first for the layer cache; no PDF typesetting, see docs/docker.md
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release --locked --no-default-features && rm -rf src target/release/deps/nextpad* target/release/nextpad*
COPY server/static ./static
COPY --from=web /web/dist/editor.js /web/dist/editor.css ./static/
COPY --from=web /web/dist/board ./static/board
COPY server/src ./src
RUN touch src/main.rs && cargo build --release --locked --no-default-features && mkdir -p /out/data

FROM ghcr.io/linuxserver/baseimage-alpine:3.23
ARG BUILD_DATE
ARG VERSION
LABEL build_version="NextPad version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL org.opencontainers.image.title="NextPad" \
      org.opencontainers.image.authors="ZWEK, Hochschule Düsseldorf" \
      org.opencontainers.image.description="Etherpad-compatible pad server with Yjs and LTI 1.3" \
      org.opencontainers.image.source="https://github.com/NextPad/NextPad" \
      org.opencontainers.image.licenses="EUPL-1.2"
ENV NEXTPAD_BIND=0.0.0.0:5090 \
    NEXTPAD_DATA=/config/data \
    NEXTPAD_API_KEYS_FILE=/config/secrets/api-keys.txt \
    NEXTPAD_LTI_FILE=/config/secrets/lti-platforms.json \
    NEXTPAD_THEME_DIR=/config/theme \
    NEXTPAD_TRUST_PROXY=false \
    RUST_LOG=info
COPY docker/root/ /
COPY --from=server /src/target/release/nextpad /app/nextpad
RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run
EXPOSE 5090
VOLUME /config
