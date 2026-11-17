# Corkboard server with the web client, in one image.
# Published as ghcr.io/trapp01/corkboard on every push to main that passes CI.
# Build: docker build -t corkboard .    Run: see docker-compose.yml and packages/server/README.md.

# The build output is JavaScript and static files, so this stage runs on the builder's own CPU
# whatever platform the image is for.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
# The desktop package is never installed here, but keep Electron's binary download off regardless.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable
WORKDIR /src
COPY . .
# Only the server, the web client and what they depend on.
RUN pnpm install --frozen-lockfile --filter "@corkboard/server..." --filter "@corkboard/web..."
# The web client builds into packages/web/dist.
RUN pnpm --filter @corkboard/web build
# One bundled file with every dependency inside it.
RUN pnpm --filter @corkboard/server build

FROM node:22-slim
ENV NODE_ENV=production \
    CORKBOARD_PORT=8422 \
    CORKBOARD_DATA=/data \
    CORKBOARD_WEB_DIR=/app/web
WORKDIR /app
COPY --from=build /src/packages/server/dist/server.js ./server.js
COPY --from=build /src/packages/web/dist ./web
# A named volume takes the owner of the folder it is mounted over.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8422
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.CORKBOARD_PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node runs as PID 1 and receives SIGTERM from `docker stop`; the server flushes and exits on it.
CMD ["node", "server.js"]
