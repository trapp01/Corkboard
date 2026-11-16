# Corkboard server with the web client, in one image.
# Build: docker build -t corkboard .    Run: see docker-compose.yml and packages/server/README.md.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
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
