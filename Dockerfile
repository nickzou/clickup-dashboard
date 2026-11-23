# syntax=docker/dockerfile:1

FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
LABEL org.opencontainers.image.source="https://github.com/nickzou/clickup-dashboard"
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/clickup.db \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY scripts/backup.mjs ./scripts/backup.mjs
# The named volume mounted at /data inherits this ownership on first use.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
